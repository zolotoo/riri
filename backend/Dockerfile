# Builder stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Dependencies
COPY go.mod go.sum* ./
RUN go mod download

# Source code
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/api cmd/api/main.go

# Final stage
FROM alpine:3.19

WORKDIR /app

# Certificates for external API calls (HTTPS)
RUN apk --no-cache add ca-certificates tzdata

COPY --from=builder /app/bin/api /app/api

EXPOSE 8080

CMD ["/app/api"]
