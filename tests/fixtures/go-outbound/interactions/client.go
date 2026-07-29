package interactions

type HTTPMethod string

const (
	HTTPGet  HTTPMethod = "GET"
	HTTPPost HTTPMethod = "POST"
)

type Request struct {
	APIMethod string
	Method    HTTPMethod
	Body      interface{}
}

type Response interface{}

type Config struct {
	BaseURL string
}

type Client interface {
	MakeRequest(Request, Response) error
	MakeRequestWithError(Request, interface{}, Response) error
}

type clientImpl struct {
	config *Config
}

func (c *clientImpl) MakeRequest(req Request, resp Response) error { return nil }

func (c *clientImpl) MakeRequestWithError(req Request, e interface{}, resp Response) error {
	return nil
}

func NewRequest() Request {
	return Request{Method: HTTPGet}
}

func NewClient(cfg *Config) Client {
	return &clientImpl{config: cfg}
}
