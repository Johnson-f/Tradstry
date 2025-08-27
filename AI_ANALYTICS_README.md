# AI-Powered Trading Analytics Feature

This document outlines the architecture and implementation plan for the AI-powered trading analytics feature in Tradistry. The goal is to provide users with automated, intelligent summaries and actionable insights based on their trading activity.

## 1. High-Level Architecture: The AI Data Pipeline

The feature operates as a data pipeline that processes user trading data and returns qualitative analysis.

1.  **Trigger**: The process is initiated either by a user action on the frontend (e.g., clicking "Generate Weekly Analysis") or by an automated, scheduled job.
2.  **Data Collection**: The backend fetches the user's raw trade data (stocks, options) for a specific period from the PostgreSQL database.
3.  **AI Chain Processing**: The data is sent to a chain of AI models for multi-step processing. This is managed in the Python backend using an orchestration library like LangChain.
    *   **Model 1 (Summarizer)**: Aggregates the raw data into quantitative facts (e.g., PnL, win rate, trade volume).
    *   **Model 2 (Analyst)**: Takes the factual summary and the raw data to identify qualitative patterns, strengths, weaknesses, and provide actionable suggestions.
4.  **Storage**: The final output from the AI chain (both the quantitative summary and qualitative insights) is persisted in a dedicated table in the PostgreSQL database.
5.  **Presentation**: The frontend fetches the stored analysis from a new API endpoint and displays it to the user in a dedicated UI component.

## 2. Backend Implementation (FastAPI)

The core logic resides in the FastAPI backend.

### API Endpoints

-   **`POST /analytics/generate-report`**:
    -   **Purpose**: To trigger the AI analysis pipeline for a specific user and date range.
    -   **Request Body**: `{ "user_id": "...", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }`
    -   **Process**:
        1.  Fetches trade data.
        2.  Executes the AI chain.
        3.  Saves the result to the database via the `upsert_ai_report` function.

-   **`GET /analytics/reports`**:
    -   **Purpose**: To retrieve the generated reports for a user.
    -   **Query Parameters**: `?user_id=...`
    -   **Process**: Calls the `select_ai_reports` database function to retrieve all available reports for the user.

### AI Orchestration (`services/analytics_service.py`)

-   This service will contain the logic for the AI chain.
-   It will use a library like **LangChain** or **LlamaIndex** to manage prompts, chain the models, and parse the output.
-   **Prompt Engineering** is key. Each model in the chain will have a carefully designed prompt to ensure it performs its specific task accurately.

## 3. Database Implementation (PostgreSQL)

Changes are required at the database level to store the AI-generated data.

### New Table: `ai_analytics_reports`

A new table is needed to store the results of the analysis.

```sql
CREATE TABLE ai_analytics_reports (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    report_type VARCHAR(50), -- e.g., 'daily', 'weekly'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    summary_data JSONB,      -- For structured data from the Summarizer model
    insights_text TEXT,       -- For readable analysis from the Analyst model
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, start_date, end_date, report_type)
);
```

### New Database Functions

-   **`upsert_ai_report(...)`**:
    -   An `UPSERT` function to insert a new report or update an existing one for the same user and period. This makes the generation process idempotent.
-   **`select_ai_reports(user_id)`**:
    -   A `SELECT` function to retrieve all reports for a given `user_id`, ordered by `created_at` descending.

## 4. Frontend Implementation (Next.js)

The frontend will provide the user interface for triggering and viewing the analysis.

### Data Fetching (`hooks/use-analytics.ts`)

-   The existing `use-analytics.ts` hook (or a new, dedicated hook) will be updated to include functions for:
    -   Calling the `POST /analytics/generate-report` endpoint to trigger the analysis.
    -   Calling the `GET /analytics/reports` endpoint to fetch and manage the state of the reports.

### UI Components (`components/analytics/`)

-   **Trigger Mechanism**: A button (e.g., "Generate Analysis") will be added to the analytics dashboard.
-   **Display Component**: A new component, such as `AIAnalyticsCard.tsx`, will be created to render the fetched reports. It will cleanly display the quantitative summary (`summary_data`) and the qualitative `insights_text`.

## 5. Future Enhancements

-   **Automated Generation**: Implement a cron job (e.g., using a service like `pg_cron` or a background task runner in FastAPI) to automatically generate reports on a daily or weekly schedule without user interaction.
-   **Streaming**: For a more interactive experience, stream the AI model's output to the frontend in real-time.
