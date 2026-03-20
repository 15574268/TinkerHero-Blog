package models

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	// 密码复杂度正则：至少包含一个大写字母、一个小写字母、一个数字
	hasUpper   = regexp.MustCompile(`[A-Z]`)
	hasLower   = regexp.MustCompile(`[a-z]`)
	hasDigit   = regexp.MustCompile(`[0-9]`)
	hasSpecial = regexp.MustCompile(`[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]`)
)

// ValidatePasswordComplexity 验证密码复杂度
// 要求：至少8个字符，包含大写字母、小写字母、数字，可选特殊字符
func ValidatePasswordComplexity(password string) error {
	if len(password) < 8 {
		return errors.New("密码长度至少8个字符")
	}
	if len(password) > 128 {
		return errors.New("密码长度不能超过128个字符")
	}

	var errMsgs []string
	if !hasUpper.MatchString(password) {
		errMsgs = append(errMsgs, "至少包含一个大写字母")
	}
	if !hasLower.MatchString(password) {
		errMsgs = append(errMsgs, "至少包含一个小写字母")
	}
	if !hasDigit.MatchString(password) {
		errMsgs = append(errMsgs, "至少包含一个数字")
	}

	// 检查是否只包含允许的字符
	for _, r := range password {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && !unicode.IsPunct(r) && !unicode.IsSymbol(r) {
			return errors.New("密码包含非法字符")
		}
	}

	if len(errMsgs) > 0 {
		return errors.New("密码复杂度不够: " + strings.Join(errMsgs, ", "))
	}

	return nil
}

type UserRole string

const (
	RoleAdmin  UserRole = "admin"
	RoleAuthor UserRole = "author"
	RoleReader UserRole = "reader"
)

type User struct {
	ID            uint           `json:"id" gorm:"primaryKey"`
	Username      string         `json:"username" gorm:"unique;not null;size:50"`
	Email         string         `json:"email" gorm:"unique;not null;size:100"`
	PasswordHash  string         `json:"-" gorm:"not null"`
	Nickname      string         `json:"nickname" gorm:"size:50"`
	Avatar        string         `json:"avatar"`
	Bio           string         `json:"bio" gorm:"size:500"`
	Website       string         `json:"website" gorm:"size:200"`
	Role          UserRole       `json:"role" gorm:"default:reader"`
	IsActive      bool           `json:"is_active" gorm:"default:true"`
	LastLoginAt   *time.Time     `json:"last_login_at"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `json:"-" gorm:"index"`
}

type RegisterRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50,alphanum"` // 添加alphanum验证
	Email    string `json:"email" binding:"required,email,max=100"`
	Password string `json:"password" binding:"required,min=8,max=100"` // 统一为min=8
	Nickname string `json:"nickname" binding:"max=50"`
}

type LoginRequest struct {
	Login    string `json:"login" binding:"required"` // username or email
	Password string `json:"password" binding:"required"`
}

type UpdateUserRequest struct {
	Nickname *string `json:"nickname"`
	Avatar   *string `json:"avatar"`
	Bio      *string `json:"bio"`
	Website  *string `json:"website"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8,max=100"` // 统一为min=8
}

// HashPassword 加密密码
func (u *User) HashPassword(password string) error {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.PasswordHash = string(bytes)
	return nil
}

// CheckPassword 验证密码
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	return err == nil
}
