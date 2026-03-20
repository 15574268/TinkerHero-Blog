package services

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/olivere/elastic/v7"
	"github.com/tinkerhero/blog/backend/internal/models"
	"github.com/tinkerhero/blog/backend/pkg/logger"
	"github.com/tinkerhero/blog/backend/pkg/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type SearchService struct {
	db    *gorm.DB
	es    *elastic.Client
	index string
}

func NewSearchService(db *gorm.DB, esURL, esUser, esPassword string) (*SearchService, error) {
	httpClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig:     &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
			MaxIdleConnsPerHost: 10,
			DialContext: (&net.Dialer{
				Timeout:   10 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
		},
	}

	tryConnect := func(url string) (*elastic.Client, error) {
		opts := []elastic.ClientOptionFunc{
			elastic.SetURL(url),
			elastic.SetSniff(false),
			elastic.SetHealthcheck(false),
			elastic.SetHttpClient(httpClient),
		}
		if esUser != "" {
			opts = append(opts, elastic.SetBasicAuth(esUser, esPassword))
		}
		return elastic.NewClient(opts...)
	}

	es, err := tryConnect(esURL)
	if err != nil && strings.HasPrefix(esURL, "http://") {
		httpsURL := "https://" + esURL[len("http://"):]
		logger.Info("ES connection failed with HTTP, trying HTTPS",
			zap.String("url", httpsURL), zap.Error(err))
		es, err = tryConnect(httpsURL)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Elasticsearch: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	info, code, err := es.Ping(esURL).Do(ctx)
	if err != nil {
		return nil, fmt.Errorf("Elasticsearch ping failed (url=%s): %w", esURL, err)
	}
	logger.Info("Elasticsearch connected",
		zap.Int("status", code),
		zap.String("cluster", info.ClusterName),
		zap.String("version", info.Version.Number))

	return &SearchService{
		db:    db,
		es:    es,
		index: "posts",
	}, nil
}

// IndexPost 索引文章到ES
func (s *SearchService) IndexPost(post *models.Post) error {
	ctx := context.Background()

	// 准备索引数据
	authorName := post.Author.Nickname
	if authorName == "" {
		authorName = post.Author.Username
	}

	var categoryName string
	if post.Category != nil {
		categoryName = post.Category.Name
	}

	doc := map[string]any{
		"id":           post.ID,
		"title":        post.Title,
		"content":      post.Content,
		"summary":      post.Summary,
		"author":       authorName,
		"category":     categoryName,
		"tags":         getTagNames(post.Tags),
		"status":       post.Status,
		"view_count":   post.ViewCount,
		"like_count":   post.LikeCount,
		"published_at": post.PublishedAt,
		"created_at":   post.CreatedAt,
	}

	_, err := s.es.Index().
		Index(s.index).
		Id(fmt.Sprintf("%d", post.ID)).
		BodyJson(doc).
		Do(ctx)

	if err != nil {
		logger.Error("索引文章失败", zap.Uint("post_id", post.ID), zap.Error(err))
	}
	return err
}

// Search 搜索文章
func (s *SearchService) Search(c *gin.Context) {
	keyword := c.Query("q")
	if keyword == "" {
		utils.BadRequest(c, "请输入搜索关键词")
		return
	}

	// 使用通用分页函数
	page, pageSize := utils.GetPagination(c)

	ctx := context.Background()

	// 构建查询
	boolQuery := elastic.NewBoolQuery()
	boolQuery.Must(
		elastic.NewMatchQuery("status", "published"),
	)

	// 多字段搜索
	multiMatch := elastic.NewMultiMatchQuery(keyword, "title^3", "content^2", "summary", "tags", "author").
		Type("best_fields").
		Fuzziness("AUTO")

	boolQuery.Must(multiMatch)

	// 高亮设置
	highlight := elastic.NewHighlight().
		Fields(elastic.NewHighlighterField("title"), elastic.NewHighlighterField("content"))

	// 执行搜索
	searchResult, err := s.es.Search().
		Index(s.index).
		Query(boolQuery).
		Highlight(highlight).
		From(utils.GetOffset(page, pageSize)).
		Size(pageSize).
		Sort("published_at", false).
		Do(ctx)

	if err != nil {
		logger.Error("搜索失败", zap.String("keyword", keyword), zap.Error(err))
		// Extract ES error details for debugging
		if e, ok := err.(*elastic.Error); ok {
			logger.Error("ES error details", zap.Int("status", e.Status), zap.String("details", fmt.Sprintf("%v", e.Details)))
		}
		utils.InternalError(c, "搜索失败")
		return
	}

	// 收集 ES 返回的文章 ID，回查数据库做二次过滤
	// 防止 ES 索引脏数据（异步删除失败、软删除等）导致已删除/非发布文章出现在结果中
	type hitEntry struct {
		source    map[string]any
		titleHL   string
		contentHL string
	}
	hitMap := make(map[uint]hitEntry, len(searchResult.Hits.Hits))
	idOrder := make([]uint, 0, len(searchResult.Hits.Hits))

	for _, hit := range searchResult.Hits.Hits {
		var source map[string]any
		if err := json.Unmarshal(hit.Source, &source); err != nil {
			logger.Warn("Failed to unmarshal search hit", zap.Error(err))
			continue
		}
		idVal, _ := source["id"].(float64)
		postID := uint(idVal)
		if postID == 0 {
			continue
		}
		entry := hitEntry{source: source}
		if len(hit.Highlight["title"]) > 0 {
			entry.titleHL = hit.Highlight["title"][0]
		}
		if len(hit.Highlight["content"]) > 0 {
			entry.contentHL = hit.Highlight["content"][0]
		}
		hitMap[postID] = entry
		idOrder = append(idOrder, postID)
	}

	// 从数据库核查哪些 ID 仍然是 published 状态（自动过滤软删除记录）
	var validIDs []uint
	if len(idOrder) > 0 {
		if err := s.db.Model(&models.Post{}).
			Where("id IN ? AND status = ?", idOrder, models.PostPublished).
			Pluck("id", &validIDs).Error; err != nil {
			logger.Warn("搜索结果 DB 验证失败，降级使用 ES 原始结果", zap.Error(err))
			validIDs = idOrder // 降级：DB 查询失败时仍返回 ES 结果
		}
	}

	// 异步清理 ES 中的脏数据（已删除或非发布文章）
	if len(validIDs) < len(idOrder) {
		validSet := make(map[uint]bool, len(validIDs))
		for _, id := range validIDs {
			validSet[id] = true
		}
		go func() {
			for _, id := range idOrder {
				if !validSet[id] {
					if delErr := s.DeletePostFromIndex(id); delErr == nil {
						logger.Info("已清理 ES 脏数据", zap.Uint("post_id", id))
					}
				}
			}
		}()
	}

	// 按原始 ES 排序组装最终结果
	validSet := make(map[uint]bool, len(validIDs))
	for _, id := range validIDs {
		validSet[id] = true
	}
	var results []map[string]any
	for _, id := range idOrder {
		if !validSet[id] {
			continue
		}
		entry := hitMap[id]
		if entry.titleHL != "" {
			entry.source["title_highlight"] = entry.titleHL
		}
		if entry.contentHL != "" {
			entry.source["content_highlight"] = entry.contentHL
		}
		results = append(results, entry.source)
	}

	utils.Success(c, gin.H{
		"data":       results,
		"total":      int64(len(results)), // 用过滤后的实际数量，避免前端分页错误
		"page":       page,
		"page_size":  pageSize,
		"keyword":    keyword,
	})
}

// SearchByTag 按标签搜索
func (s *SearchService) SearchByTag(c *gin.Context) {
	tag := c.Param("tag")

	ctx := context.Background()

	boolQuery := elastic.NewBoolQuery()
	boolQuery.Must(
		elastic.NewMatchQuery("status", "published"),
		elastic.NewMatchQuery("tags", tag),
	)

	searchResult, err := s.es.Search().
		Index(s.index).
		Query(boolQuery).
		Size(100).
		Sort("published_at", false).
		Do(ctx)

	if err != nil {
		logger.Error("按标签搜索失败", zap.String("tag", tag), zap.Error(err))
		utils.InternalError(c, "搜索失败")
		return
	}

	// 收集 ID，回查数据库过滤脏数据
	idOrder := make([]uint, 0, len(searchResult.Hits.Hits))
	hitSourceMap := make(map[uint]map[string]any, len(searchResult.Hits.Hits))
	for _, hit := range searchResult.Hits.Hits {
		var source map[string]any
		if err := json.Unmarshal(hit.Source, &source); err != nil {
			continue
		}
		idVal, _ := source["id"].(float64)
		postID := uint(idVal)
		if postID == 0 {
			continue
		}
		hitSourceMap[postID] = source
		idOrder = append(idOrder, postID)
	}

	var validIDs []uint
	if len(idOrder) > 0 {
		if err := s.db.Model(&models.Post{}).
			Where("id IN ? AND status = ?", idOrder, models.PostPublished).
			Pluck("id", &validIDs).Error; err != nil {
			validIDs = idOrder
		}
	}

	validSet := make(map[uint]bool, len(validIDs))
	for _, id := range validIDs {
		validSet[id] = true
	}
	var results []map[string]any
	for _, id := range idOrder {
		if validSet[id] {
			results = append(results, hitSourceMap[id])
		}
	}

	utils.Success(c, gin.H{
		"data":  results,
		"total": int64(len(results)),
		"tag":   tag,
	})
}

// SearchSuggestion 搜索建议
func (s *SearchService) SearchSuggestion(c *gin.Context) {
	prefix := c.Query("q")
	if len(prefix) < 2 {
		utils.Success(c, []string{})
		return
	}

	ctx := context.Background()

	// 使用completion suggester
	suggester := elastic.NewCompletionSuggester("post-suggest").
		Field("title.suggest").
		Prefix(prefix).
		Size(5)

	searchResult, err := s.es.Search().
		Index(s.index).
		Suggester(suggester).
		Do(ctx)

	if err != nil {
		logger.Warn("搜索建议失败", zap.String("prefix", prefix), zap.Error(err))
		utils.Success(c, []string{})
		return
	}

	var suggestions []string
	if suggest, found := searchResult.Suggest["post-suggest"]; found {
		for _, options := range suggest {
			for _, option := range options.Options {
				suggestions = append(suggestions, option.Text)
			}
		}
	}

	utils.Success(c, suggestions)
}

// DeletePostFromIndex 从索引中删除文章
func (s *SearchService) DeletePostFromIndex(postID uint) error {
	ctx := context.Background()
	_, err := s.es.Delete().
		Index(s.index).
		Id(fmt.Sprintf("%d", postID)).
		Do(ctx)
	if err != nil {
		logger.Error("从索引删除文章失败", zap.Uint("post_id", postID), zap.Error(err))
	}
	return err
}

func getTagNames(tags []models.Tag) []string {
	names := make([]string, len(tags))
	for i, tag := range tags {
		names[i] = tag.Name
	}
	return names
}

// hasIKPlugin 检测 ES 是否安装了 IK 分词插件
func (s *SearchService) hasIKPlugin() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := s.es.PerformRequest(ctx, elastic.PerformRequestOptions{
		Method: "GET",
		Path:   "/_cat/plugins",
		Params: map[string][]string{"format": {"json"}, "h": {"component"}},
	})
	if err != nil || res.StatusCode != 200 {
		return false
	}

	type pluginRow struct {
		Component string `json:"component"`
	}
	var rows []pluginRow
	if err := json.Unmarshal(res.Body, &rows); err != nil {
		return false
	}
	for _, row := range rows {
		if row.Component == "analysis-ik" {
			return true
		}
	}
	return false
}

func buildIndexMapping(useIK bool) string {
	analyzer := "standard"
	searchAnalyzer := "standard"
	if useIK {
		analyzer = "ik_max_word"
		searchAnalyzer = "ik_smart"
	}
	return fmt.Sprintf(`{
		"mappings": {
			"properties": {
				"title": {
					"type": "text",
					"analyzer": "%s",
					"search_analyzer": "%s",
					"fields": {
						"suggest": {
							"type": "completion"
						}
					}
				},
				"content": {
					"type": "text",
					"analyzer": "%s",
					"search_analyzer": "%s"
				},
				"summary": {
					"type": "text",
					"analyzer": "%s"
				},
				"author":       { "type": "keyword" },
				"category":     { "type": "keyword" },
				"tags":         { "type": "keyword" },
				"status":       { "type": "keyword" },
				"view_count":   { "type": "integer" },
				"like_count":   { "type": "integer" },
				"published_at": { "type": "date" },
				"created_at":   { "type": "date" }
			}
		}
	}`, analyzer, searchAnalyzer, analyzer, searchAnalyzer, analyzer)
}

// InitIndex 初始化索引
func (s *SearchService) InitIndex() error {
	ctx := context.Background()

	exists, err := s.es.IndexExists(s.index).Do(ctx)
	if err != nil {
		return err
	}

	if !exists {
		useIK := s.hasIKPlugin()
		if useIK {
			logger.Info("检测到 IK 分词插件，使用 ik_max_word 分词器")
		} else {
			logger.Warn("未检测到 IK 分词插件，回退到 standard 分词器（中文搜索效果会降低）")
		}
		mapping := buildIndexMapping(useIK)

		_, err = s.es.CreateIndex(s.index).BodyString(mapping).Do(ctx)
		if err != nil {
			logger.Error("创建索引失败", zap.Error(err))
			return err
		}
		logger.Info("索引创建成功", zap.String("index", s.index))
	}

	return nil
}

// SyncAllPosts 同步所有文章到ES
func (s *SearchService) SyncAllPosts() error {
	var posts []models.Post
	s.db.Where("status = ?", models.PostPublished).
		Preload("Author").
		Preload("Category").
		Preload("Tags").
		Find(&posts)

	for i := range posts {
		if err := s.IndexPost(&posts[i]); err != nil {
			return err
		}
	}

	logger.Info("同步文章到ES完成", zap.Int("count", len(posts)))
	return nil
}
