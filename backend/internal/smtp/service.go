package smtp

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	gosmtp "net/smtp"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	Password    string `json:"password,omitempty"`
	FromAddress string `json:"from_address"`
	FromName    string `json:"from_name"`
	TLSEnabled  bool   `json:"tls_enabled"`
	Enabled     bool   `json:"enabled"`
	UpdatedAt   time.Time `json:"updated_at"`
	UpdatedBy   *string   `json:"updated_by,omitempty"`
}

type Service struct {
	db     *pgxpool.Pool
	mu     sync.RWMutex
	cached *Config
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) GetConfig(ctx context.Context) (*Config, error) {
	s.mu.RLock()
	if s.cached != nil {
		cp := *s.cached
		s.mu.RUnlock()
		return &cp, nil
	}
	s.mu.RUnlock()
	return s.loadConfig(ctx)
}

func (s *Service) loadConfig(ctx context.Context) (*Config, error) {
	c := &Config{}
	err := s.db.QueryRow(ctx,
		`SELECT host, port, username, password, from_address, from_name, tls_enabled, enabled, updated_at, updated_by
		 FROM smtp_config WHERE id = 1`,
	).Scan(&c.Host, &c.Port, &c.Username, &c.Password, &c.FromAddress, &c.FromName, &c.TLSEnabled, &c.Enabled, &c.UpdatedAt, &c.UpdatedBy)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.cached = c
	s.mu.Unlock()
	return c, nil
}

func (s *Service) UpdateConfig(ctx context.Context, c *Config, updatedBy string) (*Config, error) {
	_, err := s.db.Exec(ctx,
		`UPDATE smtp_config SET host=$1, port=$2, username=$3, password=$4, from_address=$5, from_name=$6, tls_enabled=$7, enabled=$8, updated_at=now(), updated_by=$9 WHERE id=1`,
		c.Host, c.Port, c.Username, c.Password, c.FromAddress, c.FromName, c.TLSEnabled, c.Enabled, updatedBy)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.cached = nil
	s.mu.Unlock()
	return s.loadConfig(ctx)
}

func (s *Service) Send(ctx context.Context, to, subject, htmlBody string) error {
	cfg, err := s.GetConfig(ctx)
	if err != nil {
		return fmt.Errorf("smtp: failed to load config: %w", err)
	}
	if !cfg.Enabled || cfg.Host == "" {
		return fmt.Errorf("smtp: not configured or disabled")
	}
	return sendMail(cfg, to, subject, htmlBody)
}

func (s *Service) SendTestEmail(ctx context.Context, to string) error {
	return s.Send(ctx, to, "RiftApp SMTP Test", `
		<div style="font-family:sans-serif;padding:24px;">
			<h2 style="color:#00a8fc;">RiftApp SMTP Test</h2>
			<p>If you're reading this, your SMTP configuration is working correctly.</p>
			<p style="color:#666;font-size:12px;">Sent at `+time.Now().Format(time.RFC3339)+`</p>
		</div>`)
}

func (s *Service) SendAdminCode(ctx context.Context, to, code string) error {
	return s.Send(ctx, to, "RiftApp Admin Verification Code", fmt.Sprintf(`
		<div style="font-family:sans-serif;padding:24px;">
			<h2 style="color:#00a8fc;">Admin Verification Code</h2>
			<p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#333;">%s</p>
			<p>This code expires in 5 minutes. Do not share it with anyone.</p>
		</div>`, code))
}

func (s *Service) TestConnection(ctx context.Context) error {
	cfg, err := s.GetConfig(ctx)
	if err != nil {
		return err
	}
	if cfg.Host == "" {
		return fmt.Errorf("smtp: host not configured")
	}
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return fmt.Errorf("smtp: cannot connect to %s: %w", addr, err)
	}
	conn.Close()
	return nil
}

func sendMail(cfg *Config, to, subject, htmlBody string) error {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	from := cfg.FromAddress

	headers := fmt.Sprintf("From: %s <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=\"utf-8\"\r\n\r\n",
		cfg.FromName, from, to, subject)
	msg := []byte(headers + htmlBody)

	var auth gosmtp.Auth
	if cfg.Username != "" {
		auth = gosmtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)
	}

	if cfg.TLSEnabled && cfg.Port == 465 {
		tlsCfg := &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return err
		}
		client, err := gosmtp.NewClient(conn, cfg.Host)
		if err != nil {
			return err
		}
		defer client.Quit()
		if auth != nil {
			if err := client.Auth(auth); err != nil {
				return err
			}
		}
		if err := client.Mail(from); err != nil {
			return err
		}
		for _, rcpt := range strings.Split(to, ",") {
			if err := client.Rcpt(strings.TrimSpace(rcpt)); err != nil {
				return err
			}
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		if _, err := w.Write(msg); err != nil {
			return err
		}
		return w.Close()
	}

	recipients := make([]string, 0)
	for _, rcpt := range strings.Split(to, ",") {
		if trimmed := strings.TrimSpace(rcpt); trimmed != "" {
			recipients = append(recipients, trimmed)
		}
	}
	return gosmtp.SendMail(addr, auth, from, recipients, msg)
}
