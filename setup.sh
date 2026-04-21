#!/bin/bash
# Script to create migrations and apply them for the inventory transaction system

cd backend

echo "📦 Creating migrations for new InventoryTransaction model..."
python manage.py makemigrations inventory

echo "✅ Applying migrations..."
python manage.py migrate

echo "🌱 Seeding admin user..."
python seed_admin.py

echo "📊 Seeding real transaction data..."
python seed_data.py

echo "✨ Setup complete! Your system is now 100% data-driven."
