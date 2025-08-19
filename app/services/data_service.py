"""
Data service for the JTBD Assistant Platform.

Provides data retrieval operations for table views and data display components.
Centralizes access to database operations for insights, JTBDs, and metrics.
"""

import logging
from typing import Dict, List, Any, Optional

from ..core.database.operations import DatabaseOperations
from ..core.database.connection import get_database_manager

logger = logging.getLogger(__name__)


class DataService:
    """Service for data retrieval operations used by table views."""

    def __init__(self):
        """Initialize data service with database connection."""
        self.db_manager = get_database_manager()
        if self.db_manager and self.db_manager.client:
            self.operations = DatabaseOperations(self.db_manager.client)
        else:
            self.operations = None
            logger.error("Failed to initialize database operations")

    def get_all_metrics(self) -> Dict[str, Any]:
        """
        Retrieve all metrics for display.
        
        Returns:
            Dict with success status and metrics data
        """
        if not self.operations:
            return {"success": False, "error": "Database operations not available"}
        
        try:
            result = self.operations.get_all_metrics()
            
            if result.get("success"):
                metrics = result.get("metrics", [])
                
                # Add any additional processing for display
                for metric in metrics:
                    # Ensure description field exists
                    if "description" not in metric:
                        metric["description"] = ""
                
                logger.info(f"Retrieved {len(metrics)} metrics")
                return {
                    "success": True,
                    "metrics": metrics,
                    "count": len(metrics)
                }
            else:
                logger.error(f"Failed to retrieve metrics: {result.get('error')}")
                return result
                
        except Exception as e:
            logger.error(f"Data service error getting metrics: {e}")
            return {"success": False, "error": f"Data service error: {str(e)}"}

    def get_all_insights(self) -> Dict[str, Any]:
        """
        Retrieve all insights with source document information.
        
        Returns:
            Dict with success status and insights data
        """
        if not self.operations:
            return {"success": False, "error": "Database operations not available"}
        
        try:
            result = self.operations.get_all_insights()
            
            if result.get("success"):
                insights = result.get("insights", [])
                
                # Process insights for better display
                for insight in insights:
                    # Ensure required fields exist
                    if "description" not in insight:
                        insight["description"] = ""
                    
                    # Handle documents relationship
                    if "documents" not in insight or not insight["documents"]:
                        insight["documents"] = {"id": None, "title": "Unknown"}
                
                logger.info(f"Retrieved {len(insights)} insights")
                return {
                    "success": True,
                    "insights": insights,
                    "count": len(insights)
                }
            else:
                logger.error(f"Failed to retrieve insights: {result.get('error')}")
                return result
                
        except Exception as e:
            logger.error(f"Data service error getting insights: {e}")
            return {"success": False, "error": f"Data service error: {str(e)}"}

    def get_all_jtbds(self) -> Dict[str, Any]:
        """
        Retrieve all Jobs to be Done for display.
        
        Returns:
            Dict with success status and JTBDs data
        """
        if not self.operations:
            return {"success": False, "error": "Database operations not available"}
        
        try:
            result = self.operations.get_all_jtbds()
            
            if result.get("success"):
                jtbds = result.get("jtbds", [])
                
                # Process JTBDs for better display
                for jtbd in jtbds:
                    # Ensure required fields exist
                    if "statement" not in jtbd:
                        jtbd["statement"] = ""
                    if "context" not in jtbd:
                        jtbd["context"] = ""
                    if "outcome" not in jtbd:
                        jtbd["outcome"] = ""
                
                logger.info(f"Retrieved {len(jtbds)} JTBDs")
                return {
                    "success": True,
                    "jtbds": jtbds,
                    "count": len(jtbds)
                }
            else:
                logger.error(f"Failed to retrieve JTBDs: {result.get('error')}")
                return result
                
        except Exception as e:
            logger.error(f"Data service error getting JTBDs: {e}")
            return {"success": False, "error": f"Data service error: {str(e)}"}

    def get_summary_statistics(self) -> Dict[str, Any]:
        """
        Get summary statistics for all data types.
        
        Returns:
            Dict with counts and summary info for metrics, insights, and JTBDs
        """
        try:
            # Get counts from each data type
            metrics_result = self.get_all_metrics()
            insights_result = self.get_all_insights()
            jtbds_result = self.get_all_jtbds()
            
            summary = {
                "success": True,
                "metrics_count": 0,
                "insights_count": 0,
                "jtbds_count": 0,
                "total_items": 0,
                "errors": []
            }
            
            if metrics_result.get("success"):
                summary["metrics_count"] = metrics_result.get("count", 0)
            else:
                summary["errors"].append(f"Metrics: {metrics_result.get('error')}")
            
            if insights_result.get("success"):
                summary["insights_count"] = insights_result.get("count", 0)
            else:
                summary["errors"].append(f"Insights: {insights_result.get('error')}")
            
            if jtbds_result.get("success"):
                summary["jtbds_count"] = jtbds_result.get("count", 0)
            else:
                summary["errors"].append(f"JTBDs: {jtbds_result.get('error')}")
            
            summary["total_items"] = (
                summary["metrics_count"] + 
                summary["insights_count"] + 
                summary["jtbds_count"]
            )
            
            return summary
            
        except Exception as e:
            logger.error(f"Data service error getting summary: {e}")
            return {"success": False, "error": f"Summary error: {str(e)}"}

    def health_check(self) -> Dict[str, Any]:
        """
        Check if the data service is working properly.
        
        Returns:
            Dict with health status and component checks
        """
        health_status = {
            "healthy": False,
            "components": {
                "database_connection": False,
                "operations": False
            },
            "errors": []
        }
        
        try:
            # Check database connection
            if self.db_manager and self.db_manager.client:
                health_status["components"]["database_connection"] = True
            else:
                health_status["errors"].append("Database connection not available")
            
            # Check operations
            if self.operations:
                health_status["components"]["operations"] = True
            else:
                health_status["errors"].append("Database operations not available")
            
            # Overall health
            health_status["healthy"] = all(health_status["components"].values())
            
            return health_status
            
        except Exception as e:
            health_status["errors"].append(f"Health check error: {str(e)}")
            return health_status


# Global service instance
_data_service: Optional[DataService] = None


def get_data_service() -> Optional[DataService]:
    """
    Get the global data service instance.
    
    Returns:
        DataService instance or None if not available
    """
    global _data_service
    
    if _data_service is None:
        try:
            _data_service = DataService()
            logger.info("Data service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize data service: {e}")
            _data_service = None
    
    return _data_service


def reset_data_service() -> None:
    """Reset the global data service instance (for testing/reinitialization)."""
    global _data_service
    _data_service = None
    logger.info("Data service reset")