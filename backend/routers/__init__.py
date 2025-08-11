# This file makes the routers directory a Python package

from .stocks import router as stocks_router
from .options import router as options_router
from .setups import router as setups_router

__all__ = ['stocks_router', 'options_router', 'setups_router']
