package services

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
)

type LocaleService struct {
	localePath string
}

func NewLocaleService() *LocaleService {
	return &LocaleService{
		localePath: "./locales",
	}
}

// GetAllLocales 获取所有语言包
func (s *LocaleService) GetAllLocales(c *gin.Context) {
	files, err := os.ReadDir(s.localePath)
	if err != nil {
		if os.IsNotExist(err) {
			// 目录不存在时创建并返回空列表
			_ = os.MkdirAll(s.localePath, 0755)
			utils.Success(c, []map[string]any{})
			return
		}
		logger.Error("读取语言包失败", zap.Error(err))
		utils.InternalError(c, "读取语言包失败")
		return
	}

	locales := []map[string]any{}
	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".json") {
			lang := strings.TrimSuffix(file.Name(), ".json")
			data, err := os.ReadFile(filepath.Join(s.localePath, file.Name()))
			if err != nil {
				continue
			}

			var translations map[string]any
			json.Unmarshal(data, &translations)

			locales = append(locales, map[string]any{
				"language":     lang,
				"translations": translations,
			})
		}
	}

	utils.Success(c, locales)
}

// GetLocale 获取特定语言包
func (s *LocaleService) GetLocale(c *gin.Context) {
	lang := c.Param("lang")

	filePath := filepath.Join(s.localePath, lang+".json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		logger.Warn("语言包不存在", zap.String("lang", lang))
		utils.NotFound(c, "语言包不存在")
		return
	}

	var translations map[string]any
	json.Unmarshal(data, &translations)

	utils.Success(c, map[string]any{
		"language":     lang,
		"translations": translations,
	})
}

// UpdateLocale 更新语言包
func (s *LocaleService) UpdateLocale(c *gin.Context) {
	lang := c.Param("lang")

	var req struct {
		Translations map[string]any `json:"translations" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 验证JSON格式
	data, err := json.MarshalIndent(req.Translations, "", "  ")
	if err != nil {
		utils.BadRequest(c, "JSON格式错误")
		return
	}

	// 保存到文件
	filePath := filepath.Join(s.localePath, lang+".json")
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		logger.Error("保存语言包失败", zap.String("lang", lang), zap.Error(err))
		utils.InternalError(c, "保存失败")
		return
	}

	logger.Info("更新语言包成功", zap.String("lang", lang))
	utils.Success(c, gin.H{
		"message":  "更新成功",
		"language": lang,
	})
}

// CreateLocale 创建新语言包
func (s *LocaleService) CreateLocale(c *gin.Context) {
	var req struct {
		Language     string         `json:"language" binding:"required"`
		Translations map[string]any `json:"translations" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	// 确保目录存在
	if err := os.MkdirAll(s.localePath, 0755); err != nil {
		logger.Error("创建语言包目录失败", zap.Error(err))
		utils.InternalError(c, "创建目录失败")
		return
	}

	// 检查是否已存在
	filePath := filepath.Join(s.localePath, req.Language+".json")
	if _, err := os.Stat(filePath); err == nil {
		utils.BadRequest(c, "语言包已存在")
		return
	}

	// 保存到文件
	data, _ := json.MarshalIndent(req.Translations, "", "  ")
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		logger.Error("创建语言包失败", zap.String("language", req.Language), zap.Error(err))
		utils.InternalError(c, "创建失败")
		return
	}

	logger.Info("创建语言包成功", zap.String("language", req.Language))
	utils.Created(c, gin.H{
		"message":  "创建成功",
		"language": req.Language,
	})
}

// DeleteLocale 删除语言包
func (s *LocaleService) DeleteLocale(c *gin.Context) {
	lang := c.Param("lang")

	// 不允许删除核心语言包
	if lang == "zh" || lang == "en" {
		utils.Forbidden(c, "不能删除核心语言包")
		return
	}

	filePath := filepath.Join(s.localePath, lang+".json")
	if err := os.Remove(filePath); err != nil {
		logger.Error("删除语言包失败", zap.String("lang", lang), zap.Error(err))
		utils.InternalError(c, "删除失败")
		return
	}

	logger.Info("删除语言包成功", zap.String("lang", lang))
	utils.Success(c, gin.H{"message": "删除成功"})
}

// ExportLocales 导出所有语言包
func (s *LocaleService) ExportLocales(c *gin.Context) {
	files, err := os.ReadDir(s.localePath)
	if err != nil {
		logger.Error("读取语言包失败", zap.Error(err))
		utils.InternalError(c, "读取失败")
		return
	}

	export := map[string]map[string]any{}
	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".json") {
			lang := strings.TrimSuffix(file.Name(), ".json")
			data, _ := os.ReadFile(filepath.Join(s.localePath, file.Name()))
			var translations map[string]any
			json.Unmarshal(data, &translations)
			export[lang] = translations
		}
	}

	utils.Success(c, export)
}

// ImportLocales 导入语言包
func (s *LocaleService) ImportLocales(c *gin.Context) {
	var req map[string]map[string]any
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, err.Error())
		return
	}

	imported := []string{}
	for lang, translations := range req {
		data, _ := json.MarshalIndent(translations, "", "  ")
		filePath := filepath.Join(s.localePath, lang+".json")
		if err := os.WriteFile(filePath, data, 0644); err == nil {
			imported = append(imported, lang)
		}
	}

	logger.Info("导入语言包成功", zap.Strings("imported", imported))
	utils.Success(c, gin.H{
		"message":  "导入成功",
		"imported": imported,
	})
}
