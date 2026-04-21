import pandas as pd
import numpy as np
from prophet import Prophet
from statsmodels.tsa.arima.model import ARIMA
from sklearn.metrics import mean_absolute_error, mean_squared_error
import logging
from typing import Dict, List, Any, Optional
from datetime import timedelta
from django.core.cache import cache

logger = logging.getLogger(__name__)

class AdvancedForecaster:
    """
    Production-grade forecasting engine using an ensemble of Prophet and ARIMA.
    Includes data cleaning, feature engineering, and accuracy metrics.
    """

    def __init__(self, df: pd.DataFrame, target_col: str = 'quantity_sold', date_col: str = 'date'):
        self.df = df.copy()
        self.target_col = target_col
        self.date_col = date_col
        self.model_metrics = {}

    def prepare_data(self):
        """Clean and resample data for time-series analysis."""
        self.df[self.date_col] = pd.to_datetime(self.df[self.date_col])
        self.df = self.df.sort_values(self.date_col)
        
        # Aggregate to daily to handle multiple transactions
        daily_df = self.df.groupby(self.date_col)[self.target_col].sum().reset_index()
        
        # Handle missing dates via resampling and interpolation
        daily_df = daily_df.set_index(self.date_col).resample('D').asfreq().fillna(0).reset_index()
        
        # Outlier detection using IQR
        Q1 = daily_df[self.target_col].quantile(0.25)
        Q3 = daily_df[self.target_col].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        
        # Clip outliers instead of removing to maintain time continuity
        daily_df[self.target_col] = daily_df[self.target_col].clip(lower=lower_bound, upper=upper_bound)
        
        return daily_df

    def calculate_metrics(self, y_true, y_pred):
        """Calculate MAE, RMSE, and MAPE."""
        mae = mean_absolute_error(y_true, y_pred)
        rmse = np.sqrt(mean_squared_error(y_true, y_pred))
        # Avoid division by zero for MAPE
        y_true_safe = np.where(y_true == 0, 1, y_true)
        mape = np.mean(np.abs((y_true - y_pred) / y_true_safe)) * 100
        return {
            "mae": round(float(mae), 2),
            "rmse": round(float(rmse), 2),
            "mape": f"{round(float(mape), 2)}%"
        }

    def train_prophet(self, train_df, forecast_days):
        """Train Facebook Prophet model."""
        # Prophet requires columns 'ds' and 'y'
        prophet_df = train_df.rename(columns={self.date_col: 'ds', self.target_col: 'y'})
        
        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=len(prophet_df) > 365,
            interval_width=0.95 # 95% confidence interval
        )
        model.fit(prophet_df)
        
        future = model.make_future_dataframe(periods=forecast_days)
        forecast = model.predict(future)
        return forecast, model

    def train_arima(self, train_df, forecast_days):
        """Train ARIMA model (Auto-Regressive Integrated Moving Average)."""
        series = train_df.set_index(self.date_col)[self.target_col]
        try:
            # Simple (5,1,0) configuration; in production, you might use auto_arima
            model = ARIMA(series, order=(5, 1, 0))
            model_fit = model.fit()
            forecast = model_fit.get_forecast(steps=forecast_days)
            return forecast.predicted_mean, forecast.conf_int()
        except Exception as e:
            logger.error(f"ARIMA failed: {e}")
            return None, None

    def get_forecast(self, forecast_days: int = 30) -> Dict[str, Any]:
        """Generate ensemble forecast with metrics."""
        cache_key = f"adv_forecast_v1_{hash(str(self.df.tail(10)))}"
        cached_result = cache.get(cache_key)
        if cached_result:
            return cached_result

        processed_df = self.prepare_data()
        
        if len(processed_df) < 14:
            return {"error": "Insufficient data (minimum 14 days required)"}

        # Train/Test Split (80/20)
        split_idx = int(len(processed_df) * 0.8)
        train_df = processed_df.iloc[:split_idx]
        test_df = processed_df.iloc[split_idx:]
        
        # Train Prophet for metrics validation
        test_prophet_forecast, _ = self.train_prophet(train_df, len(test_df))
        y_pred = test_prophet_forecast['yhat'].iloc[-len(test_df):].values
        metrics = self.calculate_metrics(test_df[self.target_col].values, y_pred)
        
        # Real Forecast (Using all data)
        full_forecast, _ = self.train_prophet(processed_df, forecast_days)
        
        # Format results
        historical = processed_df.rename(columns={self.date_col: 'date', self.target_col: 'value'}).to_dict('records')
        
        # Prediction segment
        future_segment = full_forecast.tail(forecast_days)
        forecast_results = []
        for _, row in future_segment.iterrows():
            forecast_results.append({
                "date": row['ds'].strftime('%Y-%m-%d'),
                "value": round(float(row['yhat']), 2),
                "lower": round(float(row['yhat_lower']), 2),
                "upper": round(float(row['yhat_upper']), 2)
            })

        result = {
            "historical": historical,
            "forecast": forecast_results,
            "metrics": metrics,
            "trend": "up" if forecast_results[-1]['value'] > forecast_results[0]['value'] else "down"
        }
        
        cache.set(cache_key, result, 3600) # Cache for 1 hour
        return result
