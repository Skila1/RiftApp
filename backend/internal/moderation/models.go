package moderation

type AnalyzeRequest struct {
	Text        string   `json:"text"`
	Classifiers []string `json:"classifiers,omitempty"`
}

type ImageURLRequest struct {
	ImageURL string `json:"image_url"`
}

type ClassifierResult struct {
	Classifier string  `json:"classifier"`
	Flagged    bool    `json:"flagged"`
	Confidence float64 `json:"confidence"`
	Severity   string  `json:"severity"`
}

type AnalyzeResponse struct {
	Flagged          bool               `json:"flagged"`
	Results          []ClassifierResult `json:"results"`
	ProcessingTimeMs float64            `json:"processing_time_ms"`
}

type ImageAnalyzeResponse struct {
	Flagged          bool               `json:"flagged"`
	Results          []ClassifierResult `json:"results"`
	ProcessingTimeMs float64            `json:"processing_time_ms"`
}

type ModerationResult struct {
	Flagged    bool
	Category   string
	Severity   string
	Confidence float64
	Details    []ClassifierResult
}
