package validate

import (
	"fmt"
	"net/mail"
	"unicode/utf8"

	"github.com/riftapp-cloud/riftapp/internal/apperror"
)

func Username(u string) error {
	n := utf8.RuneCountInString(u)
	if n < 2 {
		return apperror.BadRequest("username must be at least 2 characters")
	}
	if n > 32 {
		return apperror.BadRequest("username must be at most 32 characters")
	}
	for _, r := range u {
		if !isUsernameRune(r) {
			return apperror.BadRequest("username may only contain letters, numbers, underscores, and hyphens")
		}
	}
	return nil
}

func isUsernameRune(r rune) bool {
	return (r >= 'a' && r <= 'z') ||
		(r >= 'A' && r <= 'Z') ||
		(r >= '0' && r <= '9') ||
		r == '_' || r == '-'
}

func Password(p string) error {
	if len(p) < 8 {
		return apperror.BadRequest("password must be at least 8 characters")
	}
	if len(p) > 128 {
		return apperror.BadRequest("password must be at most 128 characters")
	}
	return nil
}

func Email(e string) error {
	if _, err := mail.ParseAddress(e); err != nil {
		return apperror.BadRequest("invalid email address")
	}
	return nil
}

func ContentLength(content string, maxLen int) error {
	if len(content) > maxLen {
		return apperror.BadRequest(fmt.Sprintf("content too long (max %d)", maxLen))
	}
	return nil
}

func HubName(name string) error {
	n := utf8.RuneCountInString(name)
	if n == 0 {
		return apperror.BadRequest("name is required")
	}
	if n > 100 {
		return apperror.BadRequest("name must be at most 100 characters")
	}
	return nil
}

func StreamName(name string) error {
	n := utf8.RuneCountInString(name)
	if n == 0 {
		return apperror.BadRequest("name is required")
	}
	if n > 100 {
		return apperror.BadRequest("name must be at most 100 characters")
	}
	return nil
}

func DisplayName(dn string) error {
	if utf8.RuneCountInString(dn) > 64 {
		return apperror.BadRequest("display name must be at most 64 characters")
	}
	return nil
}

func Bio(b string) error {
	if utf8.RuneCountInString(b) > 190 {
		return apperror.BadRequest("bio must be at most 190 characters")
	}
	return nil
}
