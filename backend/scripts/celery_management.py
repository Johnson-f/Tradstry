#!/usr/bin/env python3
"""
Celery management scripts for Tradistry scheduler.
Provides command-line utilities for managing Celery workers and tasks.
"""

import os
import sys
import argparse
import subprocess
from pathlib import Path
from dotenv import load_dotenv

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
load_dotenv()

from scheduler.celery_service import celery_service


def start_worker(concurrency=4, queues=None):
    """Start a Celery worker."""
    cmd = [
        "celery", "-A", "scheduler.celery_app", "worker",
        "--loglevel=info",
        f"--concurrency={concurrency}"
    ]
    
    if queues:
        cmd.extend(["--queues", ",".join(queues)])
    
    print(f"Starting Celery worker: {' '.join(cmd)}")
    subprocess.run(cmd)


def start_beat():
    """Start Celery Beat scheduler."""
    cmd = ["celery", "-A", "scheduler.celery_app", "beat", "--loglevel=info"]
    print(f"Starting Celery Beat: {' '.join(cmd)}")
    subprocess.run(cmd)


def start_flower(port=5555):
    """Start Flower monitoring."""
    cmd = ["celery", "-A", "scheduler.celery_app", "flower", f"--port={port}"]
    print(f"Starting Flower: {' '.join(cmd)}")
    subprocess.run(cmd)


def purge_queues():
    """Purge all queues."""
    cmd = ["celery", "-A", "scheduler.celery_app", "purge", "-f"]
    print(f"Purging queues: {' '.join(cmd)}")
    subprocess.run(cmd)


def inspect_workers():
    """Inspect active workers."""
    status = celery_service.get_worker_status()
    print("=== Worker Status ===")
    print(f"Active workers: {status['workers']['count']}")
    for worker in status['workers']['active']:
        print(f"  - {worker}")
    
    print(f"\nQueues: {', '.join(status['queues'])}")
    print(f"Overall status: {status['status']}")


def trigger_job(job_name):
    """Trigger a specific job."""
    result = celery_service.trigger_job(job_name)
    if result['status'] == 'triggered':
        print(f"✅ Job '{job_name}' triggered successfully")
        print(f"Task ID: {result['task_id']}")
    else:
        print(f"❌ Failed to trigger job '{job_name}': {result.get('error')}")


def health_check():
    """Perform system health check."""
    health = celery_service.health_check()
    print("=== Health Check ===")
    print(f"Status: {health['status']}")
    print(f"Celery: {health.get('celery_status', 'unknown')}")
    
    if health['status'] == 'healthy':
        print("✅ System is healthy")
    else:
        print("❌ System has issues")
        if 'error' in health:
            print(f"Error: {health['error']}")


def main():
    parser = argparse.ArgumentParser(description="Celery management for Tradistry")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Worker command
    worker_parser = subparsers.add_parser("worker", help="Start Celery worker")
    worker_parser.add_argument("--concurrency", "-c", type=int, default=4,
                              help="Number of worker processes")
    worker_parser.add_argument("--queues", "-Q", nargs="+",
                              help="Queues to consume from")
    
    # Beat command
    subparsers.add_parser("beat", help="Start Celery Beat scheduler")
    
    # Flower command
    flower_parser = subparsers.add_parser("flower", help="Start Flower monitoring")
    flower_parser.add_argument("--port", "-p", type=int, default=5555,
                              help="Port for Flower web interface")
    
    # Purge command
    subparsers.add_parser("purge", help="Purge all queues")
    
    # Inspect command
    subparsers.add_parser("inspect", help="Inspect workers and queues")
    
    # Trigger command
    trigger_parser = subparsers.add_parser("trigger", help="Trigger a job")
    trigger_parser.add_argument("job_name", help="Name of job to trigger")
    
    # Health command
    subparsers.add_parser("health", help="Check system health")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    # Set environment variables if not set
    if not os.getenv("REDIS_URL"):
        os.environ["REDIS_URL"] = "redis://localhost:6379/0"
    
    try:
        if args.command == "worker":
            start_worker(args.concurrency, args.queues)
        elif args.command == "beat":
            start_beat()
        elif args.command == "flower":
            start_flower(args.port)
        elif args.command == "purge":
            purge_queues()
        elif args.command == "inspect":
            inspect_workers()
        elif args.command == "trigger":
            trigger_job(args.job_name)
        elif args.command == "health":
            health_check()
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
