package api

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

// ── OG metadata unfurl endpoint ─────────────────────────────────────

type ogMeta struct {
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	SiteName    string `json:"site_name,omitempty"`
}

// unfurlCache is a simple TTL cache for Open Graph metadata.
type unfurlCache struct {
	mu      sync.RWMutex
	entries map[string]cacheEntry
}

type cacheEntry struct {
	data      ogMeta
	expiresAt time.Time
}

var ogCache = &unfurlCache{entries: make(map[string]cacheEntry)}

const (
	cacheTTL     = 30 * time.Minute
	fetchTimeout = 6 * time.Second
	maxBodyBytes = 256 * 1024 // 256 KB – we only need the <head>
)

func (c *unfurlCache) get(key string) (ogMeta, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	e, ok := c.entries[key]
	if !ok || time.Now().After(e.expiresAt) {
		return ogMeta{}, false
	}
	return e.data, true
}

func (c *unfurlCache) set(key string, m ogMeta) {
	c.mu.Lock()
	defer c.mu.Unlock()
	// Evict if cache grows too large (simple cap).
	if len(c.entries) > 2000 {
		// Remove oldest quarter.
		i := 0
		for k := range c.entries {
			delete(c.entries, k)
			i++
			if i >= 500 {
				break
			}
		}
	}
	c.entries[key] = cacheEntry{data: m, expiresAt: time.Now().Add(cacheTTL)}
}

// ── Allowed hosts (deny SSRF to internal networks) ─────────────────

var disallowedHostRe = regexp.MustCompile(`(?i)^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)`)

func isAllowedURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	host := u.Hostname()
	if disallowedHostRe.MatchString(host) {
		return false
	}
	return true
}

// ── OG tag extraction (simple regex, no full HTML parser needed) ────

var (
	ogTagRe    = regexp.MustCompile(`<meta\s[^>]*(?:property|name)\s*=\s*"(og:[^"]+|twitter:[^"]+)"[^>]*content\s*=\s*"([^"]*)"[^>]*/?>`)
	ogTagRe2   = regexp.MustCompile(`<meta\s[^>]*content\s*=\s*"([^"]*)"[^>]*(?:property|name)\s*=\s*"(og:[^"]+|twitter:[^"]+)"[^>]*/?>`)
	titleTagRe = regexp.MustCompile(`<title[^>]*>(.*?)</title>`)
)

func extractOG(body string) ogMeta {
	props := make(map[string]string)

	for _, m := range ogTagRe.FindAllStringSubmatch(body, -1) {
		if _, exists := props[m[1]]; !exists {
			props[m[1]] = m[2]
		}
	}
	// Also try the reversed attribute order variant.
	for _, m := range ogTagRe2.FindAllStringSubmatch(body, -1) {
		key := m[2]
		val := m[1]
		if _, exists := props[key]; !exists {
			props[key] = val
		}
	}

	title := props["og:title"]
	if title == "" {
		title = props["twitter:title"]
	}
	if title == "" {
		if m := titleTagRe.FindStringSubmatch(body); len(m) > 1 {
			title = strings.TrimSpace(m[1])
		}
	}

	desc := props["og:description"]
	if desc == "" {
		desc = props["twitter:description"]
	}

	image := props["og:image"]
	if image == "" {
		image = props["twitter:image"]
	}

	siteName := props["og:site_name"]

	return ogMeta{
		Title:       truncate(title, 200),
		Description: truncate(desc, 500),
		Image:       sanitizeImageURL(image),
		SiteName:    truncate(siteName, 100),
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

func sanitizeImageURL(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if u.Scheme != "http" && u.Scheme != "https" && u.Scheme != "" {
		return ""
	}
	return raw
}

// ── HTTP handler ─────────────────────────────────────────────────────

func HandleUnfurl(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if rawURL == "" {
		writeError(w, http.StatusBadRequest, "url parameter required")
		return
	}

	if !isAllowedURL(rawURL) {
		writeError(w, http.StatusBadRequest, "url not allowed")
		return
	}

	// Check cache first.
	if cached, ok := ogCache.get(rawURL); ok {
		writeJSON(w, http.StatusOK, cached)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), fetchTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid url")
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; RiftBot/1.0)")
	req.Header.Set("Accept", "text/html")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "fetch failed")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		writeError(w, http.StatusBadGateway, "upstream error")
		return
	}

	limited := io.LimitReader(resp.Body, maxBodyBytes)
	body, err := io.ReadAll(limited)
	if err != nil {
		writeError(w, http.StatusBadGateway, "read failed")
		return
	}

	meta := extractOG(string(body))
	ogCache.set(rawURL, meta)

	writeJSON(w, http.StatusOK, meta)
}
