import React, { createContext, useState, useEffect } from 'react';
import api from '../api/client';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const response = await api.get('/accounts/me/');
        setUser(response.data);
      } catch (error) {
        const status = error?.response?.status;
        const isNetworkError = !status;
        console.error(
          'Auth check failed.',
          isNetworkError ? 'API unreachable' : `HTTP ${status}`
        );
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setUser(null);
      }
    }
    setLoading(false);
  };

  const login = async (username, password) => {
    try {
      const identifier = String(username || '').trim();
      const response = await api.post('/accounts/login/', {
        identifier,
        password,
      });
      localStorage.setItem('access_token', response.data.access);
      localStorage.setItem('refresh_token', response.data.refresh);
      setUser(response.data.user);
      return { success: true };
    } catch (error) {
      const status = error?.response?.status;
      const backendMsg = error?.response?.data?.error;
      if (!status) {
        return {
          success: false,
          error: 'Unable to reach backend API. Check server and API port configuration.',
        };
      }
      if (status === 401) {
        return { success: false, error: backendMsg || 'Invalid credentials. Please verify your access.' };
      }
      return { success: false, error: backendMsg || `Login failed (HTTP ${status}).` };
    }
  };

  const signup = async ({ username, email, password, confirm_password }) => {
    try {
      const response = await api.post('/accounts/signup/', {
        username,
        email,
        password,
        confirm_password
      });
      localStorage.setItem('access_token', response.data.access);
      localStorage.setItem('refresh_token', response.data.refresh);
      setUser(response.data.user);
      return { success: true };
    } catch (error) {
      const msg = error?.response?.data?.error || 'Signup failed.';
      return { success: false, error: msg };
    }
  };

  const getSignupAllowed = async () => {
    try {
      const response = await api.get('/accounts/signup-allowed/');
      return !!response.data?.allowed;
    } catch (error) {
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, getSignupAllowed, logout, loading }}>
        {children}
    </AuthContext.Provider>
  );
};
