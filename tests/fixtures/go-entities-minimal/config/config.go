package config

type Config struct {
	Loader *confetti.Loader
	HTTP   server.Config
	TVM    struct {
		SRC string `yaml:"src"`
	} `yaml:"tvm"`
}

const (
	KindPrimary Kind = "primary"
	KindReplica Kind = "replica"
)
