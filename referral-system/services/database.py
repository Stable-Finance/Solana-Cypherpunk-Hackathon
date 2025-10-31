"""
Database Service
Supports both SQLAlchemy (local/Render) and Supabase REST API (GitHub Actions)
"""

from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

Base = declarative_base()

class LeaderboardCache(Base):
    """Cache table for leaderboard data"""
    __tablename__ = 'leaderboard_cache'

    address = Column(String, primary_key=True)
    stable_points = Column(Float, default=0.0)
    referral_points = Column(Float, default=0.0)
    referee_bonus = Column(Integer, default=0)
    referrals = Column(Integer, default=0)
    usdx_balance = Column(Float, default=0.0)
    eurx_balance = Column(Float, default=0.0)
    usdx_staked = Column(Float, default=0.0)
    eurx_staked = Column(Float, default=0.0)
    total_staked = Column(Float, default=0.0)
    total_points = Column(Float, default=0.0)
    last_updated = Column(DateTime, default=datetime.utcnow)

    # Index for sorting by total_points
    __table_args__ = (
        Index('idx_total_points', 'total_points'),
    )

class DatabaseService:
    """Database service for leaderboard caching - auto-detects backend"""

    def __init__(self):
        # Check if Supabase credentials are available (GitHub Actions)
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_SERVICE_KEY")

        if supabase_url and supabase_key:
            # Use Supabase REST API via httpx (works from GitHub Actions)
            self.backend = "supabase"
            self.supabase_url = supabase_url
            self.supabase_key = supabase_key
            self.supabase_rest_url = f"{supabase_url}/rest/v1"
            print(f"[DatabaseService] Connected to Supabase REST API")
        else:
            # Use SQLAlchemy (local/Render with SQLite or PostgreSQL)
            self.backend = "sqlalchemy"
            self._init_sqlalchemy()

    def _init_sqlalchemy(self):
        """Initialize SQLAlchemy backend"""
        db_url = os.getenv("DATABASE_URL", "sqlite:///./leaderboard.db")
        self.engine = create_engine(db_url, echo=False)
        self.SessionLocal = sessionmaker(bind=self.engine)
        Base.metadata.create_all(self.engine)
        print(f"[DatabaseService] Connected to database: {db_url}")

    def get_session(self):
        """Get a new database session (SQLAlchemy only)"""
        if self.backend == "sqlalchemy":
            return self.SessionLocal()
        return None

    def upsert_leaderboard_entry(self, address: str, data: dict):
        """
        Insert or update a leaderboard entry

        Args:
            address: User's wallet address
            data: Dict with leaderboard data (stable_points, referral_points, etc.)
        """
        if self.backend == "supabase":
            try:
                import httpx

                # Prepare data for Supabase
                record = {"address": address, **data, "last_updated": datetime.utcnow().isoformat()}

                # Upsert using Supabase REST API
                headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}",
                    "Content-Type": "application/json",
                    "Prefer": "resolution=merge-duplicates"
                }

                response = httpx.post(
                    f"{self.supabase_rest_url}/leaderboard_cache",
                    json=record,
                    headers=headers,
                    timeout=30.0
                )
                response.raise_for_status()
                return True
            except Exception as e:
                print(f"[DatabaseService] Error upserting entry for {address}: {e}")
                return False
        else:
            # SQLAlchemy backend
            session = self.get_session()
            try:
                # Try to get existing entry
                entry = session.query(LeaderboardCache).filter_by(address=address).first()

                if entry:
                    # Update existing
                    for key, value in data.items():
                        if hasattr(entry, key):
                            setattr(entry, key, value)
                    entry.last_updated = datetime.utcnow()
                else:
                    # Create new
                    entry = LeaderboardCache(address=address, **data)
                    session.add(entry)

                session.commit()
                return True
            except Exception as e:
                session.rollback()
                print(f"[DatabaseService] Error upserting entry for {address}: {e}")
                return False
            finally:
                session.close()

    def get_leaderboard(self, limit: int = 100):
        """
        Get leaderboard sorted by total points

        Args:
            limit: Maximum number of entries to return

        Returns:
            List of leaderboard entries
        """
        if self.backend == "supabase":
            try:
                import httpx

                headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}"
                }

                response = httpx.get(
                    f"{self.supabase_rest_url}/leaderboard_cache?total_points=gt.0&order=total_points.desc&limit={limit}",
                    headers=headers,
                    timeout=30.0
                )
                response.raise_for_status()
                data = response.json()

                result = []
                for entry in data:
                    # Ensure last_updated is in ISO format with Z
                    last_updated = entry.get('last_updated', '')
                    if last_updated and not last_updated.endswith('Z'):
                        last_updated += 'Z'

                    result.append({
                        'address': entry['address'],
                        'stable_points': entry.get('stable_points', 0.0),
                        'referral_points': entry.get('referral_points', 0.0),
                        'referee_bonus': entry.get('referee_bonus', 0),
                        'referrals': entry.get('referrals', 0),
                        'usdx_balance': entry.get('usdx_balance', 0.0),
                        'eurx_balance': entry.get('eurx_balance', 0.0),
                        'usdx_staked': entry.get('usdx_staked', 0.0),
                        'eurx_staked': entry.get('eurx_staked', 0.0),
                        'total_staked': entry.get('total_staked', 0.0),
                        'total_points': entry.get('total_points', 0.0),
                        'last_updated': last_updated
                    })

                return result
            except Exception as e:
                print(f"[DatabaseService] Error getting leaderboard: {e}")
                return []
        else:
            # SQLAlchemy backend
            session = self.get_session()
            try:
                entries = session.query(LeaderboardCache)\
                    .filter(LeaderboardCache.total_points > 0)\
                    .order_by(LeaderboardCache.total_points.desc())\
                    .limit(limit)\
                    .all()

                result = []
                for entry in entries:
                    result.append({
                        'address': entry.address,
                        'stable_points': entry.stable_points,
                        'referral_points': entry.referral_points,
                        'referee_bonus': entry.referee_bonus,
                        'referrals': entry.referrals,
                        'usdx_balance': entry.usdx_balance,
                        'eurx_balance': entry.eurx_balance,
                        'usdx_staked': entry.usdx_staked,
                        'eurx_staked': entry.eurx_staked,
                        'total_staked': entry.total_staked,
                        'total_points': entry.total_points,
                        'last_updated': entry.last_updated.isoformat() + 'Z'
                    })

                return result
            finally:
                session.close()

    def get_entry_by_address(self, address: str):
        """Get a specific leaderboard entry by address"""
        if self.backend == "supabase":
            try:
                import httpx

                headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}"
                }

                response = httpx.get(
                    f"{self.supabase_rest_url}/leaderboard_cache?address=eq.{address}",
                    headers=headers,
                    timeout=30.0
                )
                response.raise_for_status()
                data = response.json()

                if not data:
                    return None

                entry = data[0]
                last_updated = entry.get('last_updated', '')
                if last_updated and not last_updated.endswith('Z'):
                    last_updated += 'Z'

                return {
                    'address': entry['address'],
                    'stable_points': entry.get('stable_points', 0.0),
                    'referral_points': entry.get('referral_points', 0.0),
                    'referee_bonus': entry.get('referee_bonus', 0),
                    'referrals': entry.get('referrals', 0),
                    'usdx_balance': entry.get('usdx_balance', 0.0),
                    'eurx_balance': entry.get('eurx_balance', 0.0),
                    'usdx_staked': entry.get('usdx_staked', 0.0),
                    'eurx_staked': entry.get('eurx_staked', 0.0),
                    'total_staked': entry.get('total_staked', 0.0),
                    'total_points': entry.get('total_points', 0.0),
                    'last_updated': last_updated
                }
            except Exception as e:
                print(f"[DatabaseService] Error getting entry by address: {e}")
                return None
        else:
            # SQLAlchemy backend
            session = self.get_session()
            try:
                entry = session.query(LeaderboardCache).filter_by(address=address).first()
                if not entry:
                    return None

                return {
                    'address': entry.address,
                    'stable_points': entry.stable_points,
                    'referral_points': entry.referral_points,
                    'referee_bonus': entry.referee_bonus,
                    'referrals': entry.referrals,
                    'usdx_balance': entry.usdx_balance,
                    'eurx_balance': entry.eurx_balance,
                    'usdx_staked': entry.usdx_staked,
                    'eurx_staked': entry.eurx_staked,
                    'total_staked': entry.total_staked,
                    'total_points': entry.total_points,
                    'last_updated': entry.last_updated.isoformat() + 'Z'
                }
            finally:
                session.close()

    def get_total_entries(self):
        """Get total number of entries in leaderboard"""
        if self.backend == "supabase":
            try:
                import httpx

                headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}",
                    "Prefer": "count=exact"
                }

                response = httpx.get(
                    f"{self.supabase_rest_url}/leaderboard_cache?total_points=gt.0&select=count",
                    headers=headers,
                    timeout=30.0
                )
                response.raise_for_status()

                # Extract count from Content-Range header
                content_range = response.headers.get('Content-Range', '')
                if content_range:
                    # Format is "0-9/100" or "*/100"
                    count_str = content_range.split('/')[-1]
                    return int(count_str) if count_str.isdigit() else 0
                return 0
            except Exception as e:
                print(f"[DatabaseService] Error getting total entries: {e}")
                return 0
        else:
            # SQLAlchemy backend
            session = self.get_session()
            try:
                return session.query(LeaderboardCache)\
                    .filter(LeaderboardCache.total_points > 0)\
                    .count()
            finally:
                session.close()

    def clear_all(self):
        """Clear all leaderboard data (for testing/reset)"""
        if self.backend == "supabase":
            try:
                import httpx

                headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}"
                }

                response = httpx.delete(
                    f"{self.supabase_rest_url}/leaderboard_cache?address=neq.",
                    headers=headers,
                    timeout=30.0
                )
                response.raise_for_status()
                print("[DatabaseService] Cleared all leaderboard data")
                return True
            except Exception as e:
                print(f"[DatabaseService] Error clearing data: {e}")
                return False
        else:
            # SQLAlchemy backend
            session = self.get_session()
            try:
                session.query(LeaderboardCache).delete()
                session.commit()
                print("[DatabaseService] Cleared all leaderboard data")
                return True
            except Exception as e:
                session.rollback()
                print(f"[DatabaseService] Error clearing data: {e}")
                return False
            finally:
                session.close()
