import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

class DataAnalyticsEngine:
    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.logs = []

    def clean_data(self):
        """Perform data cleaning: Fill nulls, drop empty rows, fix types."""
        self.logs.append("Initializing sanitization protocol...")
        
        initial_rows = len(self.df)
        
        # 0. Drop exact duplicates (Step 2)
        self.df = self.df.drop_duplicates()
        if len(self.df) < initial_rows:
            self.logs.append(f"Pruned {initial_rows - len(self.df)} duplicate records from dataset.")
            initial_rows = len(self.df)

        # 1. Drop rows with all NaN
        self.df = self.df.dropna(how='all')
        if len(self.df) < initial_rows:
            self.logs.append(f"Excised {initial_rows - len(self.df)} empty rows.")

        # 2. Fill nulls based on column types
        for col in self.df.columns:
            # Try to identify and normalize date columns
            if 'date' in col.lower() or 'time' in col.lower() or 'period' in col.lower():
                try:
                    self.df[col] = pd.to_datetime(self.df[col], errors='coerce')
                    self.logs.append(f"Normalized temporal vector '{col}' to datetime format.")
                    continue
                except:
                    pass

            if self.df[col].dtype in ['float64', 'int64']:
                null_count = self.df[col].isnull().sum()
                if null_count > 0:
                    median_val = self.df[col].median()
                    self.df[col] = self.df[col].fillna(median_val)
                    self.logs.append(f"Substituted {null_count} nulls in '{col}' with median ({median_val}).")
            else:
                null_count = self.df[col].isnull().sum()
                if null_count > 0:
                    self.df[col] = self.df[col].fillna("Unknown")
                    self.logs.append(f"Labeled {null_count} missing entries in '{col}' as 'Unknown'.")

        self.logs.append("Sanitization complete.")
        return self

    def detect_outliers(self):
        """Identify anomalies using Z-score method."""
        self.logs.append("Scanning for statistical anomalies...")
        
        anomalies_found = 0
        for col in self.df.select_dtypes(include=[np.number]).columns:
            # Z-Score
            mean = self.df[col].mean()
            std = self.df[col].std()
            if std == 0: continue
            
            z_scores = (self.df[col] - mean) / std
            outliers = np.abs(z_scores) > 3
            # Count outliers and add to total
            count = int(outliers.sum())
            anomalies_found += count
            
            if count > 0:
                self.df.loc[outliers, col] = mean # Smooth outliers to mean for safety
                # Optional: Cap outliers or just log them
                # self.df.loc[outliers, col] = mean # e.g., capping
        
        if anomalies_found > 0:
            self.logs.append(f"Isolated {anomalies_found} outliers across numeric vectors.")
        else:
            self.logs.append("No critical anomalies detected in dataset.")
            
        return self

    def normalize_data(self):
        """Normalize numeric columns to 0-1 range for AI processing."""
        self.logs.append("Normalizing feature vectors for AI engine...")
        
        for col in self.df.select_dtypes(include=[np.number]).columns:
            min_val = self.df[col].min()
            max_val = self.df[col].max()
            if max_val - min_val > 0:
                self.df[f"{col}_norm"] = (self.df[col] - min_val) / (max_val - min_val)
        
        self.logs.append("Data normalization complete.")
        return self

    def get_results(self):
        """Return cleaned dataframe and processing logs."""
        # Convert datetime to string for JSON serialization
        results_df = self.df.copy()
        for col in results_df.columns:
            if pd.api.types.is_datetime64_any_dtype(results_df[col]):
                results_df[col] = results_df[col].dt.strftime('%Y-%m-%d %H:%M:%S')
                
        # Replace NaN with None for JSON serialization
        results_df = results_df.where(pd.notnull(results_df), None)
        return results_df, self.logs
