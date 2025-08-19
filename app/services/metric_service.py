"""
Metric service for managing metrics creation and operations.
Handles individual metric creation with validation for numeric values.
"""

from typing import Dict, List, Any, Optional, Union
import logging

from ..core.database.connection import get_database_manager

logger = logging.getLogger(__name__)


class MetricService:
    """Service for managing metric creation and operations."""

    def __init__(self, database_manager=None):
        """Initialize metric service with database manager."""
        self.db = database_manager or get_database_manager()
        
        if not self.db:
            raise ValueError("Database manager is required for MetricService")

    def create_metric(
        self,
        name: str,
        current_value: Optional[Union[int, float]] = None,
        target_value: Optional[Union[int, float]] = None,
        unit: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new metric with validation.

        Args:
            name: The metric name (required)
            current_value: Current value of the metric (optional)
            target_value: Target value of the metric (optional)
            unit: Unit of measurement (optional)

        Returns:
            Dict with success status and created metric data
        """
        try:
            # Validate inputs
            validation_result = self.validate_metric_input(name, current_value, target_value, unit)
            if not validation_result.get("valid"):
                return {
                    "success": False,
                    "error": "Validation failed",
                    "validation_errors": validation_result.get("errors", [])
                }

            # Convert values to float for database storage
            current_val = float(current_value) if current_value is not None else None
            target_val = float(target_value) if target_value is not None else None

            # Create metric in database
            if hasattr(self.db, 'ops') and self.db.ops:
                result = self.db.ops.create_metric(
                    name=name,
                    current_value=current_val,
                    target_value=target_val,
                    unit=unit
                )
            else:
                result = self.db.create_metric(
                    name=name,
                    current_value=current_val,
                    target_value=target_val,
                    unit=unit
                )

            if result.get("success"):
                logger.info(f"Created metric: {name}")
                return {
                    "success": True,
                    "metric": result.get("metric"),
                    "message": "Metric created successfully"
                }
            else:
                logger.error(f"Failed to create metric: {result.get('error')}")
                return result

        except Exception as e:
            logger.error(f"Error creating metric: {e}")
            return {"success": False, "error": f"Failed to create metric: {str(e)}"}

    def validate_metric_input(
        self,
        name: str,
        current_value: Optional[Union[int, float]] = None,
        target_value: Optional[Union[int, float]] = None,
        unit: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validate metric input data.

        Args:
            name: The metric name
            current_value: Current value
            target_value: Target value
            unit: Unit of measurement

        Returns:
            Dict with validation results
        """
        errors = []
        warnings = []

        # Validate name
        if not name or not name.strip():
            errors.append("Metric name is required")
        elif len(name.strip()) < 2:
            errors.append("Metric name should be at least 2 characters long")
        elif len(name.strip()) > 255:
            errors.append("Metric name should be less than 255 characters")

        # Validate current_value
        if current_value is not None:
            try:
                float(current_value)
            except (TypeError, ValueError):
                errors.append("Current value must be a valid number")

        # Validate target_value
        if target_value is not None:
            try:
                float(target_value)
            except (TypeError, ValueError):
                errors.append("Target value must be a valid number")

        # Validate unit
        if unit and len(unit.strip()) > 50:
            errors.append("Unit should be less than 50 characters")

        # Add warnings for best practices
        if current_value is None and target_value is None:
            warnings.append("Consider adding either a current or target value for better tracking")

        if current_value is not None and target_value is not None:
            try:
                curr_val = float(current_value)
                targ_val = float(target_value)
                if curr_val == targ_val:
                    warnings.append("Current and target values are the same")
            except (TypeError, ValueError):
                pass  # Already handled above

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }

    def get_all_metrics(self) -> Dict[str, Any]:
        """
        Get all available metrics.

        Returns:
            Dict with all metrics data
        """
        try:
            if hasattr(self.db, 'ops') and self.db.ops:
                result = self.db.ops.get_all_metrics()
            else:
                result = self.db.get_all_metrics()

            return result

        except Exception as e:
            logger.error(f"Error getting metrics: {e}")
            return {"success": False, "error": f"Failed to get metrics: {str(e)}"}

    def calculate_metric_progress(self, current_value: Union[int, float], target_value: Union[int, float]) -> Dict[str, Any]:
        """
        Calculate progress percentage for a metric.

        Args:
            current_value: Current metric value
            target_value: Target metric value

        Returns:
            Dict with progress calculation
        """
        try:
            if current_value is None or target_value is None:
                return {"success": False, "error": "Both current and target values required"}

            curr_val = float(current_value)
            targ_val = float(target_value)

            if targ_val == 0:
                return {"success": False, "error": "Target value cannot be zero"}

            # Calculate progress percentage
            progress = (curr_val / targ_val) * 100

            return {
                "success": True,
                "progress_percentage": round(progress, 2),
                "is_achieved": progress >= 100,
                "remaining": targ_val - curr_val
            }

        except (TypeError, ValueError) as e:
            return {"success": False, "error": f"Invalid numeric values: {str(e)}"}
        except Exception as e:
            logger.error(f"Error calculating progress: {e}")
            return {"success": False, "error": f"Failed to calculate progress: {str(e)}"}


# Global service instance management
_metric_service = None


def initialize_metric_service(database_manager=None) -> MetricService:
    """Initialize the global metric service instance."""
    global _metric_service
    _metric_service = MetricService(database_manager)
    return _metric_service


def get_metric_service() -> Optional[MetricService]:
    """Get the global metric service instance."""
    global _metric_service
    return _metric_service


def reset_metric_service() -> None:
    """Reset the global metric service instance (for testing)."""
    global _metric_service
    _metric_service = None