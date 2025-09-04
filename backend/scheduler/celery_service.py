"""
Celery service for managing workers and tasks in Tradistry scheduler.
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from celery import Celery
from celery.result import AsyncResult
import redis
import os

from .celery_app import celery_app

logger = logging.getLogger(__name__)


class CeleryService:
    """Service for managing Celery workers and tasks."""
    
    def __init__(self):
        self.celery_app = celery_app
        self.redis_client = redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379/0'))
    
    def get_worker_status(self) -> Dict[str, Any]:
        """Get status of active workers."""
        try:
            # Get active workers
            inspect = self.celery_app.control.inspect()
            active_workers = inspect.active()
            registered_tasks = inspect.registered()
            
            if not active_workers:
                return {
                    'status': 'no_workers',
                    'workers': {'count': 0, 'active': []},
                    'queues': [],
                    'message': 'No active workers found'
                }
            
            # Extract worker information
            worker_names = list(active_workers.keys())
            
            # Get queue information
            queues = set()
            for worker_tasks in registered_tasks.values() if registered_tasks else []:
                for task in worker_tasks:
                    if 'scheduler.tasks.' in task:
                        # Extract queue from task routing
                        task_name = task.split('.')[-1]
                        if task_name in ['fetch_stock_quotes', 'fetch_options_chain']:
                            queues.add('market_hours')
                        elif task_name in ['fetch_historical_prices', 'fetch_fundamental_data', 'fetch_dividend_data']:
                            queues.add('daily')
                        elif task_name in ['fetch_earnings_data', 'fetch_news_data']:
                            queues.add('periodic')
                        else:
                            queues.add('default')
            
            return {
                'status': 'active',
                'workers': {
                    'count': len(worker_names),
                    'active': worker_names
                },
                'queues': list(queues),
                'message': f'{len(worker_names)} workers active'
            }
            
        except Exception as e:
            logger.error(f"Error getting worker status: {e}")
            return {
                'status': 'error',
                'workers': {'count': 0, 'active': []},
                'queues': [],
                'error': str(e)
            }
    
    def trigger_job(self, job_name: str, **kwargs) -> Dict[str, Any]:
        """Trigger a specific job manually."""
        try:
            # Map job names to task names
            task_mapping = {
                'stock_quotes': 'scheduler.tasks.fetch_stock_quotes',
                'options_chain': 'scheduler.tasks.fetch_options_chain',
                'historical_prices': 'scheduler.tasks.fetch_historical_prices',
                'fundamental_data': 'scheduler.tasks.fetch_fundamental_data',
                'dividend_data': 'scheduler.tasks.fetch_dividend_data',
                'earnings_data': 'scheduler.tasks.fetch_earnings_data',
                'news_data': 'scheduler.tasks.fetch_news_data',
                'health_check': 'scheduler.tasks.health_check',
            }
            
            if job_name not in task_mapping:
                return {
                    'status': 'error',
                    'error': f'Unknown job name: {job_name}',
                    'available_jobs': list(task_mapping.keys())
                }
            
            task_name = task_mapping[job_name]
            
            # Send task to queue
            result = self.celery_app.send_task(task_name, kwargs=kwargs)
            
            logger.info(f"Triggered job '{job_name}' with task ID: {result.id}")
            
            return {
                'status': 'triggered',
                'job_name': job_name,
                'task_id': result.id,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error triggering job '{job_name}': {e}")
            return {
                'status': 'error',
                'job_name': job_name,
                'error': str(e)
            }
    
    def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """Get status of a specific task."""
        try:
            result = AsyncResult(task_id, app=self.celery_app)
            
            return {
                'task_id': task_id,
                'status': result.status,
                'result': result.result if result.ready() else None,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error getting task status for {task_id}: {e}")
            return {
                'task_id': task_id,
                'status': 'error',
                'error': str(e)
            }
    
    def get_scheduled_tasks(self) -> Dict[str, Any]:
        """Get information about scheduled tasks."""
        try:
            # Get beat schedule from celery app configuration
            beat_schedule = self.celery_app.conf.beat_schedule
            
            scheduled_tasks = []
            for task_name, schedule_info in beat_schedule.items():
                scheduled_tasks.append({
                    'name': task_name,
                    'task': schedule_info['task'],
                    'schedule': str(schedule_info['schedule']),
                    'queue': schedule_info.get('options', {}).get('queue', 'default')
                })
            
            return {
                'status': 'success',
                'scheduled_tasks': scheduled_tasks,
                'count': len(scheduled_tasks)
            }
            
        except Exception as e:
            logger.error(f"Error getting scheduled tasks: {e}")
            return {
                'status': 'error',
                'error': str(e)
            }
    
    def health_check(self) -> Dict[str, Any]:
        """Perform comprehensive health check."""
        try:
            health_status = {
                'status': 'healthy',
                'timestamp': datetime.now().isoformat(),
                'components': {}
            }
            
            # Check Redis connection
            try:
                self.redis_client.ping()
                health_status['components']['redis'] = 'connected'
            except Exception as e:
                health_status['components']['redis'] = f'error: {e}'
                health_status['status'] = 'unhealthy'
            
            # Check Celery workers
            worker_status = self.get_worker_status()
            if worker_status['status'] == 'active':
                health_status['components']['celery_workers'] = f"{worker_status['workers']['count']} active"
            else:
                health_status['components']['celery_workers'] = worker_status['status']
                if worker_status['status'] == 'no_workers':
                    health_status['status'] = 'degraded'
                else:
                    health_status['status'] = 'unhealthy'
            
            # Check scheduled tasks
            scheduled_status = self.get_scheduled_tasks()
            if scheduled_status['status'] == 'success':
                health_status['components']['scheduled_tasks'] = f"{scheduled_status['count']} configured"
            else:
                health_status['components']['scheduled_tasks'] = 'error'
                health_status['status'] = 'unhealthy'
            
            return health_status
            
        except Exception as e:
            logger.error(f"Error in health check: {e}")
            return {
                'status': 'error',
                'timestamp': datetime.now().isoformat(),
                'error': str(e)
            }
    
    def get_queue_lengths(self) -> Dict[str, int]:
        """Get the length of each queue."""
        try:
            queues = ['market_hours', 'daily', 'periodic', 'default', 'celery']
            queue_lengths = {}
            
            for queue in queues:
                try:
                    length = self.redis_client.llen(queue)
                    queue_lengths[queue] = length
                except Exception as e:
                    logger.warning(f"Could not get length for queue {queue}: {e}")
                    queue_lengths[queue] = -1
            
            return queue_lengths
            
        except Exception as e:
            logger.error(f"Error getting queue lengths: {e}")
            return {}
    
    def purge_queues(self, queues: Optional[List[str]] = None) -> Dict[str, Any]:
        """Purge specified queues or all queues."""
        try:
            if queues is None:
                queues = ['market_hours', 'daily', 'periodic', 'default', 'celery']
            
            purged_counts = {}
            for queue in queues:
                try:
                    count = self.redis_client.llen(queue)
                    self.redis_client.delete(queue)
                    purged_counts[queue] = count
                    logger.info(f"Purged {count} tasks from queue '{queue}'")
                except Exception as e:
                    logger.error(f"Error purging queue {queue}: {e}")
                    purged_counts[queue] = -1
            
            return {
                'status': 'success',
                'purged_queues': purged_counts,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error purging queues: {e}")
            return {
                'status': 'error',
                'error': str(e)
            }


# Global service instance
celery_service = CeleryService()
