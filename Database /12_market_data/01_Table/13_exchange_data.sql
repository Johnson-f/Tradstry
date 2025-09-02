CREATE TABLE IF NOT EXISTS exchanges (
    id SERIAL PRIMARY KEY,
    exchange_code VARCHAR(10) NOT NULL UNIQUE,
    exchange_name VARCHAR(100) NOT NULL,
    country VARCHAR(50),
    timezone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);