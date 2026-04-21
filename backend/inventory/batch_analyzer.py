"""
Batch Inventory Analysis Engine
Processes inventory data in batches to identify overstock, alert stock, and dead stock items.

STRICT RULES:
- Process data in batches, not per individual row
- Analyze all records together for consolidated results
- No external API calls
- High accuracy and consistency
- Deterministic output for same input
"""
from django.utils import timezone
from datetime import timedelta
from typing import List, Dict, Any
from decimal import Decimal


class BatchInventoryAnalyzer:
    """
    Optimized analyzer for large-scale inventory classification.
    """

    def __init__(self, products_data: List[Dict[str, Any]]):
        """
        Initialize with batch product data.
        
        Args:
            products_data: List of product records with stock and transaction info
        """
        self.products_data = products_data
        self.analysis_result = {
            "overstock": [],
            "alert_stock": [],
            "dead_stock": [],
            "summary": {
                "total_records": len(products_data),
                "overstock_count": 0,
                "alert_count": 0,
                "dead_stock_count": 0
            }
        }

    def analyze(self) -> Dict[str, Any]:
        """
        Execute batch analysis on all products.
        
        Returns:
            Structured JSON with classification results
        """
        if not self.products_data:
            return self.analysis_result

        # Calculate statistics across entire batch
        stats = self._calculate_batch_statistics()

        # Classify each product
        for product in self.products_data:
            classifications = self._classify_product(product, stats)
            
            if classifications["is_overstock"]:
                self.analysis_result["overstock"].append({
                    "sku": product.get("sku"),
                    "name": product.get("name"),
                    "current_stock": product.get("current_stock", 0),
                    "sales_velocity": round(product.get("sales_velocity", 0), 2),
                    "days_of_inventory": product.get("days_of_inventory", 0),
                    "reason": "High quantity with low sales velocity"
                })
                self.analysis_result["summary"]["overstock_count"] += 1

            if classifications["is_alert"]:
                self.analysis_result["alert_stock"].append({
                    "sku": product.get("sku"),
                    "name": product.get("name"),
                    "current_stock": product.get("current_stock", 0),
                    "reorder_point": product.get("reorder_point", 0),
                    "safety_stock": product.get("safety_stock", 0),
                    "reason": "Stock level near or below minimum threshold"
                })
                self.analysis_result["summary"]["alert_count"] += 1

            if classifications["is_dead_stock"]:
                self.analysis_result["dead_stock"].append({
                    "sku": product.get("sku"),
                    "name": product.get("name"),
                    "current_stock": product.get("current_stock", 0),
                    "last_sale_days_ago": product.get("last_sale_days_ago", 999),
                    "category": product.get("category", "Unknown"),
                    "reason": "No sales activity in recent period"
                })
                self.analysis_result["summary"]["dead_stock_count"] += 1

        # Remove duplicates
        self._deduplicate_results()

        return self.analysis_result

    def _calculate_batch_statistics(self) -> Dict[str, float]:
        """
        Calculate aggregate statistics across entire batch for percentile analysis.
        """
        stock_levels = [p.get("current_stock", 0) for p in self.products_data]
        sales_velocities = [p.get("sales_velocity", 0) for p in self.products_data]
        days_of_inventory = [p.get("days_of_inventory", 0) for p in self.products_data if p.get("days_of_inventory", 0) > 0]

        return {
            "avg_stock": sum(stock_levels) / len(stock_levels) if stock_levels else 0,
            "median_velocity": sorted(sales_velocities)[len(sales_velocities) // 2] if sales_velocities else 0,
            "p75_inventory_days": sorted(days_of_inventory)[int(len(days_of_inventory) * 0.75)] if days_of_inventory else 90,
        }

    def _classify_product(self, product: Dict[str, Any], stats: Dict[str, float]) -> Dict[str, bool]:
        """
        Classify a single product across three categories.
        
        Returns:
            Dictionary with boolean flags for each classification
        """
        current_stock = product.get("current_stock", 0)
        sales_velocity = product.get("sales_velocity", 0)
        reorder_point = product.get("reorder_point", 0)
        safety_stock = product.get("safety_stock", 0)
        last_sale_days_ago = product.get("last_sale_days_ago", 999)
        days_of_inventory = product.get("days_of_inventory", 0)

        # OVERSTOCK: High quantity with low sales
        # - Stock > 2x average AND sales velocity < median velocity
        # - Days of inventory > 75th percentile
        is_overstock = (
            current_stock > stats["avg_stock"] * 2 and
            sales_velocity < (stats["median_velocity"] * 0.5 if stats["median_velocity"] > 0 else 1) and
            days_of_inventory > stats["p75_inventory_days"]
        )

        # ALERT STOCK: Near or below minimum
        # - Current stock <= 1.5x reorder point (warning zone)
        # - OR current stock < safety stock
        is_alert = (
            (reorder_point > 0 and current_stock <= reorder_point * 1.5) or
            (safety_stock > 0 and current_stock <= safety_stock) or
            (reorder_point > 0 and current_stock <= reorder_point)
        )

        # DEAD STOCK: No recent activity
        # - No sales in last 90 days AND no purchases in last 60 days
        # - Current stock > 0 (not already sold out)
        last_purchase_days_ago = product.get("last_purchase_days_ago", 999)
        is_dead_stock = (
            last_sale_days_ago > 90 and
            last_purchase_days_ago > 60 and
            current_stock > 0
        )

        return {
            "is_overstock": is_overstock,
            "is_alert": is_alert,
            "is_dead_stock": is_dead_stock
        }

    def _deduplicate_results(self):
        """
        Remove duplicate entries across categories.
        A product in multiple categories is kept only in highest priority:
        dead_stock > alert_stock > overstock
        """
        seen_skus = set()

        # Process in priority order (highest to lowest)
        for category in ["dead_stock", "alert_stock", "overstock"]:
            unique_items = []
            for item in self.analysis_result[category]:
                sku = item.get("sku")
                if sku not in seen_skus:
                    unique_items.append(item)
                    seen_skus.add(sku)

            self.analysis_result[category] = unique_items

        # Update counts after deduplication
        self.analysis_result["summary"]["overstock_count"] = len(self.analysis_result["overstock"])
        self.analysis_result["summary"]["alert_count"] = len(self.analysis_result["alert_stock"])
        self.analysis_result["summary"]["dead_stock_count"] = len(self.analysis_result["dead_stock"])

    def analyze_from_models(self, products_queryset) -> Dict[str, Any]:
        """
        Convenience method to analyze from Django Product queryset.
        
        Args:
            products_queryset: Django queryset of Product models
            
        Returns:
            Analysis results
        """
        from django.db.models import Sum
        from .models import InventoryTransaction

        products_data = []

        for product in products_queryset:
            current_stock = product.current_closing_stock
            
            # Sales velocity (units/day)
            cutoff_date = timezone.now() - timedelta(days=30)
            sales_30d = InventoryTransaction.objects.filter(
                product=product,
                transaction_type="SALE",
                transaction_date__gte=cutoff_date
            ).aggregate(total=Sum("quantity"))["total"] or 0
            sales_velocity = abs(sales_30d) / 30

            # Days of inventory
            days_of_inventory = 0
            if sales_velocity > 0:
                days_of_inventory = int(current_stock / sales_velocity)

            # Last sale date
            last_sale = InventoryTransaction.objects.filter(
                product=product,
                transaction_type="SALE"
            ).latest("transaction_date", default=None)
            last_sale_days_ago = (timezone.now() - last_sale.transaction_date).days if last_sale else 999

            # Last purchase date
            last_purchase = InventoryTransaction.objects.filter(
                product=product,
                transaction_type="PURCHASE"
            ).latest("transaction_date", default=None)
            last_purchase_days_ago = (timezone.now() - last_purchase.transaction_date).days if last_purchase else 999

            # Get stock record metadata
            stock_record = product.stock
            reorder_point = stock_record.reorder_point if stock_record else 0
            safety_stock = stock_record.safety_stock if stock_record else 0

            products_data.append({
                "sku": product.sku,
                "name": product.name,
                "category": product.category,
                "current_stock": current_stock,
                "sales_velocity": sales_velocity,
                "days_of_inventory": days_of_inventory,
                "last_sale_days_ago": last_sale_days_ago,
                "last_purchase_days_ago": last_purchase_days_ago,
                "reorder_point": reorder_point,
                "safety_stock": safety_stock,
            })

        self.products_data = products_data
        return self.analyze()
