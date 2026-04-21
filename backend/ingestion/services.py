"""
Smart Column-Mapping Service for the Ingestion Engine.
Robusly uses pandas to detect and parse CSV/Excel files.
"""
import re
import logging
import io
import zipfile
import pandas as pd

logger = logging.getLogger(__name__)

# Canonical business field aliases
FIELD_ALIASES = {
    'sku':           ['sku', 'product_id', 'item_code', 'product_code', 'article'],
    'name':          ['name', 'product_name', 'item_name', 'title', 'description'],
    'quantity':      ['qty', 'quantity', 'units', 'stock', 'on_hand', 'amount'],
    'price':         ['price', 'cost', 'unit_price', 'sell_price', 'rate', 'value'],
    'category':      ['category', 'cat', 'group', 'type', 'class'],
    'date':          ['date', 'created_at', 'order_date', 'timestamp', 'updated_at'],
    'supplier':      ['supplier', 'vendor', 'source', 'manufacturer'],
    'warehouse':     ['warehouse', 'location', 'store', 'depot', 'site'],
}

def _normalize(col: str) -> str:
    """Lowercase, strip spaces and underscores for comparison."""
    if not isinstance(col, str):
        return ""
    return re.sub(r'[\s_\-]+', '', col.lower())

def suggest_mapping(columns: list) -> dict:
    """
    Returns a dict of {original_column: suggested_field_name}.
    If no match found, maps to None.
    """
    mapping = {}
    for col in columns:
        norm = _normalize(col)
        matched = None
        for field, aliases in FIELD_ALIASES.items():
            if any(norm == _normalize(alias) or _normalize(alias) in norm for alias in aliases):
                matched = field
                break
        mapping[col] = matched
    return mapping

def process_file_data(file_content: bytes, file_type: str):
    """
    Parses CSV/Excel/JSON with robust error handling and fallback logic.
    """
    if not file_content:
        raise ValueError("The uploaded file is empty.")

    df = None
    stream = io.BytesIO(file_content)

    try:
        if file_type == 'xlsx':
            try:
                df = pd.read_excel(stream, engine='openpyxl')
            except (zipfile.BadZipFile, ValueError, KeyError) as e:
                logger.warning(f"Excel parsing failed for .xlsx ({e}). Attempting CSV fallback.")
                stream.seek(0)
                try:
                    df = pd.read_csv(stream, encoding='utf-8')
                except Exception:
                    stream.seek(0)
                    df = pd.read_csv(stream, encoding='latin1')
        
        elif file_type == 'xls':
            try:
                df = pd.read_excel(stream)
            except Exception as e:
                logger.warning(f"Legacy Excel parsing failed ({e}). Attempting CSV fallback.")
                stream.seek(0)
                df = pd.read_csv(stream, encoding='latin1')

        elif file_type == 'csv':
            try:
                df = pd.read_csv(stream, encoding='utf-8')
            except UnicodeDecodeError:
                stream.seek(0)
                df = pd.read_csv(stream, encoding='latin1')

        elif file_type == 'json':
            try:
                df = pd.read_json(stream)
            except Exception as e:
                logger.error(f"Failed to parse JSON schema: {e}")
                raise ValueError("JSON file structure is invalid or unrecognized.")

        else:
            raise ValueError("Unsupported file format")

    except zipfile.BadZipFile:
        logger.error(f"BadZipFile: invalid Excel file.")
        raise ValueError("Invalid Excel file. File may be corrupted or renamed.")
    except pd.errors.ParserError as pe:
        logger.error(f"Pandas ParserError: {pe}")
        raise ValueError("CSV file structure is incorrect. Expected fields mismatch.")
    except Exception as e:
        logger.error(f"Critical Ingestion Error [{file_type}]: {e}")
        raise ValueError("File parsing failed")

    # Content Validation
    if df is None or df.empty or len(df.columns) == 0:
        raise ValueError("The uploaded file contains no readable data or columns.")
        
    if df.shape[0] < 2:
        raise ValueError("File must contain data rows. Please provide a dataset with valid records.")

    # Clean data
    df = df.dropna(how='all') # Drop rows where all elements are missing
    df = df.drop_duplicates() # Drop exact duplicates
    
    # Store string columns representing the original data 
    df.columns = df.columns.astype(str)

    columns = df.columns.tolist()
    records = df.to_dict(orient='records')
    
    # Force float NaNs and Infs to None to satisfy SQLite JSON_VALID constraints
    # (pandas occasionally forces them back to NaN in the dict if the column dtype is float)
    import math
    import numpy as np
    for row in records:
        for key, val in row.items():
            # Robustly handle Nulls (NaN, NaT, None) and Infinite values
            if pd.isna(val) or (isinstance(val, (float, np.floating)) and math.isinf(val)):
                row[key] = None
            # Handle Timestamps and Datetime objects by converting to ISO string
            elif hasattr(val, 'isoformat'):
                try:
                    row[key] = val.isoformat()
                except Exception:
                    row[key] = str(val)

    
    return columns, records
