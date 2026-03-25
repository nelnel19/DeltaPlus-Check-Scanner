import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);
    if (username === 'arnelvb@gmail.com' && password === 'deltaplus') {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('full_name', 'Accounting Management');
      navigate('/dashboard');
    } else {
      alert('Invalid credentials');
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2>DeltaPlus Accounting</h2>
        <p>Check Scanner - Login</p>
        <form onSubmit={handleLogin} style={styles.form}>
          <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required style={styles.input} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={styles.input} />
          <button type="submit" disabled={loading} style={styles.button}>{loading ? 'Logging in...' : 'Login'}</button>
        </form>
        <div style={styles.hint}><small>Use: arnelvb@gmail.com / deltaplus</small></div>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f4f7fa' },
  card: { backgroundColor: '#fff', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', width: '320px', textAlign: 'center' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' },
  input: { padding: '10px', fontSize: '16px', borderRadius: '4px', border: '1px solid #ccc' },
  button: { padding: '10px', fontSize: '16px', backgroundColor: '#0066CC', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  hint: { marginTop: '15px', color: '#64748B' }
};

export default Login;