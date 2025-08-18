"""
Database connection and utilities for JTBD Assistant Platform
"""
import os
from typing import Optional, List, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class DatabaseManager:
    """Manages Supabase database connections and operations"""
    
    def __init__(self):
        self.client: Optional[Client] = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Supabase client"""
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment")
        
        self.client = create_client(url, key)
    
    def test_connection(self) -> Dict[str, Any]:
        """Test database connection and basic functionality"""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}
        
        try:
            # Test basic connection by querying a simple SQL
            response = self.client.rpc("version").execute()
            
            # Test table existence
            tables = [
                "documents", "document_chunks", "insights", 
                "jtbds", "metrics", "hmws", "solutions",
                "llm_traces"
            ]
            
            results = {}
            for table in tables:
                try:
                    response = self.client.table(table).select("count").limit(1).execute()
                    results[table] = "exists"
                except Exception as e:
                    results[table] = f"error: {str(e)}"
            
            # Test vector search function
            try:
                # Create a dummy vector for testing (1536 dimensions of zeros)
                test_vector = [0.0] * 1536
                response = self.client.rpc("search_chunks", {
                    "query_embedding": test_vector,
                    "match_count": 1
                }).execute()
                results["search_chunks_function"] = "working"
            except Exception as e:
                results["search_chunks_function"] = f"error: {str(e)}"
            
            return {
                "success": True,
                "tables": results,
                "message": "Database connection successful"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Connection failed: {str(e)}"
            }
    
    def insert_test_data(self) -> Dict[str, Any]:
        """Insert minimal test data to verify functionality"""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}
        
        try:
            # Insert a test document
            doc_response = self.client.table("documents").insert({
                "title": "Test Document",
                "content": "This is a test document for JTBD Assistant Platform"
            }).execute()
            
            if not doc_response.data:
                return {"success": False, "error": "Failed to insert test document"}
            
            doc_id = doc_response.data[0]["id"]
            
            # Insert a test metric
            metric_response = self.client.table("metrics").insert({
                "name": "User Satisfaction",
                "current_value": 7.5,
                "target_value": 9.0,
                "unit": "rating"
            }).execute()
            
            # Insert a test JTBD
            jtbd_response = self.client.table("jtbds").insert({
                "statement": "When I need to analyze customer feedback, I want to quickly extract insights, so I can make data-driven product decisions",
                "context": "Product management workflow",
                "outcome": "Faster decision making based on customer insights"
            }).execute()
            
            return {
                "success": True,
                "document_id": doc_id,
                "message": "Test data inserted successfully"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to insert test data: {str(e)}"
            }
    
    def cleanup_test_data(self) -> Dict[str, Any]:
        """Clean up test data"""
        if not self.client:
            return {"success": False, "error": "Client not initialized"}
        
        try:
            # Delete test data
            tables_to_clean = ["solutions", "hmws", "insights", "jtbds", "metrics", "documents", "llm_traces"]
            
            for table in tables_to_clean:
                try:
                    self.client.table(table).delete().gte("id", "00000000-0000-0000-0000-000000000000").execute()
                except Exception as e:
                    print(f"Note: Could not clean {table}: {str(e)}")
            
            return {
                "success": True,
                "message": "Test data cleaned up"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Cleanup failed: {str(e)}"
            }

# Create global database manager instance
db = DatabaseManager()

if __name__ == "__main__":
    """Test the database connection"""
    print("Testing database connection...")
    
    # Test connection
    result = db.test_connection()
    print(f"Connection test: {result}")
    
    if result["success"]:
        print("\n✅ Database connection successful!")
        print("Table status:")
        for table, status in result["tables"].items():
            print(f"  {table}: {status}")
    else:
        print(f"\n❌ Database connection failed: {result['error']}")
        print("\nPlease ensure:")
        print("1. SUPABASE_URL is set in your .env file")
        print("2. SUPABASE_KEY is set in your .env file")
        print("3. The Supabase project is running")
        print("4. The migration has been applied")