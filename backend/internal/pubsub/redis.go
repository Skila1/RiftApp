package pubsub

import (
	"context"

	"github.com/redis/go-redis/v9"
)

type RedisBroker struct {
	client *redis.Client
}

func NewRedisBroker(redisURL string) (*RedisBroker, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	client := redis.NewClient(opts)

	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	return &RedisBroker{client: client}, nil
}

func (b *RedisBroker) Publish(ctx context.Context, channel string, payload []byte) error {
	return b.client.Publish(ctx, channel, payload).Err()
}

func (b *RedisBroker) Subscribe(ctx context.Context, channel string, handler func([]byte)) error {
	sub := b.client.Subscribe(ctx, channel)
	ch := sub.Channel()

	go func() {
		for msg := range ch {
			handler([]byte(msg.Payload))
		}
	}()

	return nil
}

func (b *RedisBroker) Close() error {
	return b.client.Close()
}
