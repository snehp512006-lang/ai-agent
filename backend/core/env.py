import os
from pathlib import Path


try:
    from dotenv import load_dotenv, dotenv_values
except ImportError:
    try:
        from django_dotenv import load_dotenv

        def dotenv_values(*args, **kwargs):
            return {}
    except ImportError:
        def load_dotenv(*args, **kwargs):
            return False

        def dotenv_values(*args, **kwargs):
            return {}


class EnvConfig:
    """Simple environment reader with .env fallback values."""

    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self._env_file_values = {}
        self._load()

    def _load(self):
        env_path = self.base_dir / '.env'
        load_dotenv(env_path)

        # Compatibility fallback for setups where python-dotenv does not preload early.
        if not os.environ.get('DATABASE_URL'):
            try:
                import environ

                environ.Env.read_env(env_path)
            except Exception:
                pass

        try:
            self._env_file_values = dotenv_values(env_path) or {}
        except Exception:
            self._env_file_values = {}

    def get(self, name: str, default=''):
        return os.environ.get(name) or self._env_file_values.get(name, default)

    def get_bool(self, name: str, default: bool = False) -> bool:
        fallback = 'True' if default else 'False'
        return str(self.get(name, fallback)) == 'True'

    def get_list(self, name: str, default=''):
        raw = self.get(name, default)
        if isinstance(raw, (list, tuple)):
            return [str(item).strip() for item in raw if str(item).strip()]
        return [item.strip() for item in str(raw or '').split(',') if item.strip()]
