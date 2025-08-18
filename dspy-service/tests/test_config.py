"""
Tests for configuration validation and DSPy setup.
"""

import os
import pytest
from unittest.mock import patch, MagicMock

from config import Config, config


class TestConfig:
    """Test configuration validation and setup."""
    
    def test_default_values(self):
        """Test default configuration values."""
        assert Config.OPENAI_MODEL == "gpt-5-nano"
        assert Config.OPENAI_TEMPERATURE == 0.7
        assert Config.OPENAI_MAX_TOKENS == 3000
        assert Config.HOST == "0.0.0.0"
        assert Config.PORT == 8000
        assert Config.DSPY_CACHE is True
        assert Config.DEFAULT_HMW_COUNT == 5
        assert Config.DEFAULT_SOLUTION_COUNT == 5
    
    def test_config_validation_missing_required(self):
        """Test configuration validation fails with missing required vars."""
        with patch.object(Config, 'OPENAI_API_KEY', None):
            with pytest.raises(ValueError) as exc_info:
                Config.validate()
            assert "Missing required environment variables" in str(exc_info.value)
            assert "OPENAI_API_KEY" in str(exc_info.value)
    
    def test_config_validation_invalid_temperature(self):
        """Test configuration validation fails with invalid temperature."""
        with patch.object(Config, 'OPENAI_API_KEY', 'test-key'), \
             patch.object(Config, 'API_KEY', 'test-api-key'), \
             patch.object(Config, 'OPENAI_TEMPERATURE', 3.0):
            with pytest.raises(ValueError) as exc_info:
                Config.validate()
            assert "OPENAI_TEMPERATURE must be between 0.0 and 2.0" in str(exc_info.value)
    
    def test_config_validation_invalid_max_tokens(self):
        """Test configuration validation fails with invalid max tokens."""
        with patch.object(Config, 'OPENAI_API_KEY', 'test-key'), \
             patch.object(Config, 'API_KEY', 'test-api-key'), \
             patch.object(Config, 'OPENAI_MAX_TOKENS', 20000):
            with pytest.raises(ValueError) as exc_info:
                Config.validate()
            assert "OPENAI_MAX_TOKENS must be between 1 and 16384" in str(exc_info.value)
    
    def test_config_validation_invalid_log_level(self):
        """Test configuration validation fails with invalid log level."""
        with patch.object(Config, 'OPENAI_API_KEY', 'test-key'), \
             patch.object(Config, 'API_KEY', 'test-api-key'), \
             patch.object(Config, 'LOG_LEVEL', 'INVALID'):
            with pytest.raises(ValueError) as exc_info:
                Config.validate()
            assert "LOG_LEVEL must be one of:" in str(exc_info.value)
    
    def test_config_validation_success(self):
        """Test configuration validation succeeds with valid values."""
        with patch.object(Config, 'OPENAI_API_KEY', 'test-key'), \
             patch.object(Config, 'API_KEY', 'test-api-key'):
            # Should not raise any exception
            Config.validate()
    
    def test_get_dspy_config(self):
        """Test DSPy configuration dictionary generation."""
        with patch.object(Config, 'OPENAI_API_KEY', 'test-key'):
            dspy_config = Config.get_dspy_config()
            
            assert dspy_config['model'] == Config.OPENAI_MODEL
            assert dspy_config['api_key'] == 'test-key'
            assert dspy_config['temperature'] == Config.OPENAI_TEMPERATURE
            assert dspy_config['max_tokens'] == Config.OPENAI_MAX_TOKENS
            assert dspy_config['cache'] == Config.DSPY_CACHE
            assert dspy_config['timeout'] == Config.OPENAI_TIMEOUT
    
    def test_get_openai_lm_config(self):
        """Test OpenAI LM configuration dictionary generation."""
        with patch.object(Config, 'OPENAI_API_KEY', 'test-key'):
            lm_config = Config.get_openai_lm_config()
            
            assert lm_config['api_key'] == 'test-key'
            assert lm_config['temperature'] == Config.OPENAI_TEMPERATURE
            assert lm_config['max_tokens'] == Config.OPENAI_MAX_TOKENS
            assert lm_config['cache'] == Config.DSPY_CACHE


class TestDSPyInitialization:
    """Test DSPy initialization and configuration."""
    
    @pytest.fixture
    def mock_dspy(self):
        """Mock DSPy module."""
        with patch('dspy_modules.dspy') as mock:
            mock_lm = MagicMock()
            mock.LM.return_value = mock_lm
            mock.configure = MagicMock()
            yield mock
    
    def test_initialize_dspy_success(self, mock_dspy):
        """Test successful DSPy initialization."""
        from dspy_modules import initialize_dspy, reset_dspy
        
        # Reset state first
        reset_dspy()
        
        with patch.object(config, 'OPENAI_API_KEY', 'test-key'), \
             patch.object(config, 'API_KEY', 'test-api-key'):
            
            result = initialize_dspy()
            
            assert result is True
            mock_dspy.LM.assert_called_once()
            mock_dspy.configure.assert_called_once()
    
    def test_initialize_dspy_failure(self, mock_dspy):
        """Test DSPy initialization failure."""
        from dspy_modules import initialize_dspy, reset_dspy
        
        # Reset state first
        reset_dspy()
        
        # Mock LM creation to fail
        mock_dspy.LM.side_effect = Exception("Connection failed")
        
        with patch.object(config, 'OPENAI_API_KEY', 'test-key'), \
             patch.object(config, 'API_KEY', 'test-api-key'):
            
            result = initialize_dspy()
            
            assert result is False
    
    def test_is_initialized(self):
        """Test DSPy initialization status check."""
        from dspy_modules import is_initialized, reset_dspy
        
        # Reset first
        reset_dspy()
        assert is_initialized() is False
        
        # After successful initialization (mocked)
        with patch('dspy_modules._initialized', True), \
             patch('dspy_modules._lm', MagicMock()):
            assert is_initialized() is True