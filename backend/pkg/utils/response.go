package utils

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ErrorCode 标准错误代码
type ErrorCode string

const (
	ErrBadRequest    ErrorCode = "BAD_REQUEST"
	ErrUnauthorized  ErrorCode = "UNAUTHORIZED"
	ErrForbidden     ErrorCode = "FORBIDDEN"
	ErrNotFound      ErrorCode = "NOT_FOUND"
	ErrConflict      ErrorCode = "CONFLICT"
	ErrTooManyReq    ErrorCode = "TOO_MANY_REQUESTS"
	ErrInternal      ErrorCode = "INTERNAL_ERROR"
	ErrValidation    ErrorCode = "VALIDATION_ERROR"
	ErrDatabase      ErrorCode = "DATABASE_ERROR"
	ErrCache         ErrorCode = "CACHE_ERROR"
)

// APIResponse 统一API响应格式
type APIResponse struct {
	Success   bool       `json:"success"`
	Data      any        `json:"data,omitempty"`
	Error     *ErrorInfo `json:"error,omitempty"`
	Message   string     `json:"message,omitempty"`
	RequestID string     `json:"request_id,omitempty"`
}

// ErrorInfo 错误详情
type ErrorInfo struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Detail  string    `json:"detail,omitempty"`
}

// PaginatedResponse 分页响应
type PaginatedResponse struct {
	Data     any   `json:"data"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
}

// Success 成功响应
func Success(c *gin.Context, data any) {
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data:    data,
	})
}

// SuccessWithMessage 成功响应带消息
func SuccessWithMessage(c *gin.Context, message string, data any) {
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data:    data,
		Message: message,
	})
}

// Created 创建成功响应
func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, APIResponse{
		Success: true,
		Data:    data,
	})
}

// NoContent 无内容响应
func NoContent(c *gin.Context) {
	c.Status(http.StatusNoContent)
}

// BadRequest 400 错误请求
func BadRequest(c *gin.Context, message string) {
	c.JSON(http.StatusBadRequest, APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    ErrBadRequest,
			Message: message,
		},
	})
}

// BadRequestWithDetail 400 错误请求带详情
func BadRequestWithDetail(c *gin.Context, message, detail string) {
	c.JSON(http.StatusBadRequest, APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    ErrBadRequest,
			Message: message,
			Detail:  detail,
		},
	})
}

// ValidationError 验证错误
func ValidationError(c *gin.Context, detail string) {
	c.JSON(http.StatusBadRequest, APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    ErrValidation,
			Message: "数据验证失败",
			Detail:  detail,
		},
	})
}

// Unauthorized 401 未授权
func Unauthorized(c *gin.Context, message string) {
	c.JSON(http.StatusUnauthorized, APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    ErrUnauthorized,
			Message: message,
		},
	})
}

// Forbidden 403 禁止访问
func Forbidden(c *gin.Context, message string) {
	c.JSON(http.StatusForbidden, APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    ErrForbidden,
			Message: message,
		},
	})
}

// NotFound 404 未找到
func NotFound(c *gin.Context, message string) {
	c.JSON(http.StatusNotFound, APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    ErrNotFound,
			Message: message,
		},
	})
}

// Conflict 409 冲突
func Conflict(c *gin.Context, message string) {
	c.JSON(http.StatusConflict, APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    ErrConflict,
			Message: message,
		},
	})
}

// TooManyRequests 429 请求过多
func TooManyRequests(c *gin.Context, retryAfter int) {
	c.Header("Retry-After", strconv.Itoa(retryAfter))
	c.JSON(http.StatusTooManyRequests, APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    ErrTooManyReq,
			Message: "请求过于频繁，请稍后再试",
		},
	})
}

// InternalError 500 内部错误
func InternalError(c *gin.Context, message string) {
	c.JSON(http.StatusInternalServerError, APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    ErrInternal,
			Message: message,
		},
	})
}

// DatabaseError 数据库错误
func DatabaseError(c *gin.Context, message string) {
	c.JSON(http.StatusInternalServerError, APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    ErrDatabase,
			Message: message,
		},
	})
}

// Paginated 分页响应
func Paginated(c *gin.Context, data any, total int64, page, pageSize int) {
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data: PaginatedResponse{
			Data:     data,
			Total:    total,
			Page:     page,
			PageSize: pageSize,
		},
	})
}

// LegacySuccess 兼容旧格式的成功响应
func LegacySuccess(c *gin.Context, data any) {
	c.JSON(http.StatusOK, data)
}

// LegacyError 兼容旧格式的错误响应
func LegacyError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"error": message})
}

// LegacyPaginated 兼容旧格式的分页响应
func LegacyPaginated(c *gin.Context, data any, total int64, page, pageSize int) {
	c.JSON(http.StatusOK, gin.H{
		"data":      data,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}
