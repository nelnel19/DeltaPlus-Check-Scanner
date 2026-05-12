import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/login.css';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Check for admin credentials (full access)
    if (username === 'deltaplusaccounting' && password === 'accounting') {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('full_name', 'Accounting Management');
      localStorage.setItem('userRole', 'admin'); // Add role
      // Use navigate with replace to prevent going back to login
      navigate('/dashboard', { replace: true });
    } 
    // Check for viewer credentials (read-only access)
    else if (username === 'Backoffice' && password === 'backoffice') {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('full_name', 'Backoffice Viewer');
      localStorage.setItem('userRole', 'viewer'); // Add role
      // Use navigate with replace to prevent going back to login
      navigate('/dashboard', { replace: true });
    } 
    else {
      alert('Invalid credentials. Please use the correct username and password.');
      setLoading(false);
    }
    // Don't set loading to false on success because we're navigating away
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo-container">
          <img src="/deltaplus.png" alt="DeltaPlus" className="login-logo" />
          <p className="login-subtitle">Check Scanner System</p>
        </div>
        
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <label className="input-label">Username</label>
            <input 
              type="text" 
              placeholder="Enter your username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required 
              className="login-input"
            />
          </div>
          
          <div className="input-group">
            <label className="input-label">Password</label>
            <input 
              type="password" 
              placeholder="Enter your password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              className="login-input"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading} 
            className="login-button"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <div className="login-footer">
          <div className="divider"></div>
        </div>
      </div>
    </div>
  );
}

export default Login;