package main

import (
	"context"
	"log"

	"github.com/Johnson-f/tradistry_backend/config"
	"github.com/Johnson-f/tradistry_backend/routers"
	"github.com/Johnson-f/tradistry_backend/services"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"
)

func main() {
	// load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env file not found, relying on environment variables.")
	}

	// Load configuration
	cfg := config.Load()

	// Create a new Fiber instance
	app := fiber.New(fiber.Config{
		AppName: "Tradistry Backend API v1.0.0",
	})

	// Add middleware
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,HEAD,PUT,DELETE,PATCH",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	// Initialize Supabase database service
	dbService, err := services.NewDatabaseService(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize database service: %v", err)
	}

	// Perform database health check
	ctx := context.Background()
	if err := dbService.HealthCheck(ctx); err != nil {
		log.Printf("Database health check failed: %v", err)
	}

	// Initialize Supabase services
	userService := services.NewSupabaseUserService(dbService)
	tradeService := services.NewSupabaseTradeService(dbService)

	// Initialize routers
	userRouter := routers.NewUserRouter(userService)
	tradeRouter := routers.NewTradeRouter(tradeService)

	// Basic routes
	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"message": "Welcome to Tradistry Backend API",
			"version": "1.0.0",
			"status":  "running",
		})
	})

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "healthy",
		})
	})

	// API routes group
	api := app.Group("/api/v1")

	// Setup routes
	userRouter.SetupUserRoutes(api)
	tradeRouter.SetupTradeRoutes(api)

	// Example API endpoint
	api.Get("/ping", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"message": "pong",
		})
	})

	// Start server
	log.Printf("Server starting on port %s", cfg.Server.Port)
	log.Fatal(app.Listen(":" + cfg.Server.Port))
}
