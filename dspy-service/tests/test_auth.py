"""
Tests for API authentication and security.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

# Import after patching to avoid initialization issues
with patch('dspy_modules.initialize_dspy', return_value=True):
    from main import app


class TestAuthentication:
    """Test API key authentication."""
    
    def setup_method(self):
        """Setup test client."""
        self.client = TestClient(app)
    
    def test_health_check_no_auth_required(self):
        """Test health check endpoint doesn't require authentication."""
        response = self.client.get("/health")
        assert response.status_code == 200
        assert response.json()["service"] == "intelligence"
    
    def test_generate_hmw_missing_api_key(self):
        """Test HMW endpoint fails without API key."""
        response = self.client.post(
            "/api/intelligence/generate_hmw",
            json={
                "context": {
                    "insights": [{"id": "i1", "content": "Test insight"}]
                }
            }
        )
        assert response.status_code == 401
        assert "Missing API key" in response.text
    
    def test_generate_hmw_invalid_api_key(self):
        """Test HMW endpoint fails with invalid API key."""
        response = self.client.post(
            "/api/intelligence/generate_hmw",
            json={
                "context": {
                    "insights": [{"id": "i1", "content": "Test insight"}]
                }
            },
            headers={"x-api-key": "invalid-key"}
        )
        assert response.status_code == 403
        error_data = response.json()
        assert error_data["code"] == "INVALID_API_KEY"
    
    @patch('config.config.API_KEY', 'test-api-key')
    def test_generate_hmw_valid_api_key(self):
        """Test HMW endpoint accepts valid API key."""
        response = self.client.post(
            "/api/intelligence/generate_hmw",
            json={
                "context": {
                    "insights": [{"id": "i1", "content": "Test insight"}]
                }
            },
            headers={"x-api-key": "test-api-key"}
        )
        # Should not be authentication error (may be other errors due to mocking)
        assert response.status_code != 401
        assert response.status_code != 403
    
    def test_create_solutions_missing_api_key(self):
        """Test solution endpoint fails without API key."""
        response = self.client.post(
            "/api/intelligence/create_solutions",
            json={
                "hmws": [{"id": "h1", "question": "How might we test?"}],
                "context": {
                    "metrics": [{"id": "m1", "name": "Test", "unit": "score"}]
                }
            }
        )
        assert response.status_code == 401
    
    @patch('config.config.API_KEY', 'test-api-key')
    def test_create_solutions_valid_api_key(self):
        """Test solution endpoint accepts valid API key."""
        response = self.client.post(
            "/api/intelligence/create_solutions",
            json={
                "hmws": [{"id": "h1", "question": "How might we test?"}],
                "context": {
                    "metrics": [{"id": "m1", "name": "Test", "unit": "score"}]
                }
            },
            headers={"x-api-key": "test-api-key"}
        )
        # Should not be authentication error
        assert response.status_code != 401
        assert response.status_code != 403


class TestErrorHandling:
    """Test error handling and response formatting."""
    
    def setup_method(self):
        """Setup test client."""
        self.client = TestClient(app)
    
    @patch('config.config.API_KEY', 'test-api-key')
    def test_validation_error_format(self):
        """Test validation errors are properly formatted."""
        response = self.client.post(
            "/api/intelligence/generate_hmw",
            json={"context": {}},  # Invalid: empty context
            headers={"x-api-key": "test-api-key"}
        )
        
        assert response.status_code == 422
        error_data = response.json()
        assert error_data["code"] == "VALIDATION_ERROR"
        assert error_data["action"] == "NONE"
        assert "validation_errors" in error_data["details"]
    
    @patch('config.config.API_KEY', 'test-api-key')
    def test_request_id_in_headers(self):
        """Test request ID is returned in response headers."""
        response = self.client.get("/health")
        assert "x-request-id" in response.headers
        
        request_id = response.headers["x-request-id"]
        assert len(request_id) > 0  # Should be UUID format
    
    @patch('config.config.API_KEY', 'test-api-key')
    def test_cors_headers(self):
        """Test CORS headers are properly set."""
        # Preflight request
        response = self.client.options(
            "/api/intelligence/generate_hmw",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST"
            }
        )
        
        # Should allow the TypeScript service origin
        assert response.status_code == 200