package moderation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *Client) Health(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("localmod health check failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("localmod health check returned %d", resp.StatusCode)
	}
	return nil
}

func (c *Client) AnalyzeText(ctx context.Context, text string, classifiers []string) (*AnalyzeResponse, error) {
	body := AnalyzeRequest{Text: text, Classifiers: classifiers}
	var result AnalyzeResponse
	if err := c.post(ctx, "/analyze", body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) AnalyzeImageURL(ctx context.Context, imageURL string) (*ImageAnalyzeResponse, error) {
	body := ImageURLRequest{ImageURL: imageURL}
	var result ImageAnalyzeResponse
	if err := c.post(ctx, "/analyze/image", body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) post(ctx context.Context, path string, body interface{}, result interface{}) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("localmod request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("localmod returned %d: %s", resp.StatusCode, string(respBody))
	}
	if err := json.Unmarshal(respBody, result); err != nil {
		return fmt.Errorf("unmarshal response: %w", err)
	}
	return nil
}
