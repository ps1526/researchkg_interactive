import React, { useState } from 'react';
import { useAuth } from '../components/AuthProvider';

const Login = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  
  const { login, register, resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    
    if (!email || !password) {
      setMessage({ type: 'error', text: 'Please enter all fields' });
      return;
    }
    
    console.log(`Attempting to ${activeTab === 'login' ? 'login' : 'register'} with email: ${email}`);
    setLoading(true);
    
    try {
      let result;
      if (activeTab === 'login') {
        result = await login(email, password);
      } else {
        console.log('Calling register function with password length:', password.length);
        result = await register(email, password);
      }
      
      console.log('Auth result:', result);
      
      if (result.success) {
        if (activeTab === 'login') {
          onClose(); // Close modal on successful login
        } else {
          setMessage({ type: 'success', text: 'Registration successful! You can now log in.' });
          setActiveTab('login');
        }
      } else {
        console.error('Auth error details:', result.error);
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      console.error('Unexpected error during auth:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    
    if (!email) {
      setMessage({ type: 'error', text: 'Please enter your email address' });
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await resetPassword(email);
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Password reset instructions sent to your email' });
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: "white",
      borderRadius: "8px",
      maxWidth: "450px",
      width: "100%",
      padding: "24px",
      boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)"
    }}>
      {!forgotPassword ? (
        <>
          <div style={{
            marginBottom: "16px", 
            display: "flex", 
            borderBottom: "1px solid #E5E7EB"
          }}>
            <button 
              onClick={() => setActiveTab('login')}
              style={{
                flex: 1,
                padding: "12px 8px",
                background: "none",
                border: "none",
                fontSize: "16px",
                fontWeight: activeTab === 'login' ? "600" : "400",
                color: activeTab === 'login' ? "#4F46E5" : "#6B7280",
                borderBottom: activeTab === 'login' ? "2px solid #4F46E5" : "none",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Login
            </button>
            <button 
              onClick={() => setActiveTab('register')}
              style={{
                flex: 1,
                padding: "12px 8px",
                background: "none",
                border: "none",
                fontSize: "16px",
                fontWeight: activeTab === 'register' ? "600" : "400",
                color: activeTab === 'register' ? "#4F46E5" : "#6B7280",
                borderBottom: activeTab === 'register' ? "2px solid #4F46E5" : "none",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Register
            </button>
          </div>
          
          <h3 style={{ 
            fontSize: "18px", 
            fontWeight: "600", 
            color: "#1F2937", 
            marginBottom: "16px",
            display: "flex",
            alignItems: "center"
          }}>
            <svg style={{marginRight: "8px", height: "20px", width: "20px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={activeTab === 'login' ? 
                "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" : 
                "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"} />
            </svg>
            {activeTab === 'login' ? 'Login to Your Account' : 'Create a New Account'}
          </h3>
          
          {message.text && (
            <div style={{
              padding: "12px",
              marginBottom: "16px",
              borderRadius: "4px",
              fontSize: "14px",
              backgroundColor: message.type === 'error' ? "#FEF2F2" : "#ECFDF5",
              color: message.type === 'error' ? "#B91C1C" : "#065F46",
              borderLeft: `4px solid ${message.type === 'error' ? "#EF4444" : "#10B981"}`
            }}>
              {message.text}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div style={{marginBottom: "16px"}}>
              <label 
                htmlFor="email"
                style={{ 
                  display: "block", 
                  fontSize: "14px", 
                  fontWeight: "500", 
                  color: "#4B5563", 
                  marginBottom: "6px" 
                }}
              >
                Email
              </label>
              <input 
                type="email" 
                id="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                style={{ 
                  width: "100%",
                  border: "1px solid #D1D5DB",
                  borderRadius: "4px",
                  padding: "8px 12px",
                  fontSize: "14px",
                  color: "#374151",
                  outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              />
            </div>
            
            <div style={{marginBottom: "16px"}}>
              <label 
                htmlFor="password"
                style={{ 
                  display: "block", 
                  fontSize: "14px", 
                  fontWeight: "500", 
                  color: "#4B5563", 
                  marginBottom: "6px" 
                }}
              >
                Password
              </label>
              <input 
                type="password" 
                id="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                style={{ 
                  width: "100%",
                  border: "1px solid #D1D5DB",
                  borderRadius: "4px",
                  padding: "8px 12px",
                  fontSize: "14px",
                  color: "#374151",
                  outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              />
            </div>
            
            {activeTab === 'login' && (
              <div style={{textAlign: "right", marginBottom: "16px"}}>
                <button 
                  type="button" 
                  onClick={() => setForgotPassword(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#4F46E5",
                    fontSize: "14px",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Forgot Password?
                </button>
              </div>
            )}
            
            <button 
              type="submit" 
              disabled={loading}
              style={{
                width: "100%",
                backgroundColor: "#4F46E5",
                padding: "10px 16px",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                activeTab === 'login' ? 'Login' : 'Register'
              )}
            </button>
          </form>
        </>
      ) : (
        <>
          <h3 style={{ 
            fontSize: "18px", 
            fontWeight: "600", 
            color: "#1F2937", 
            marginBottom: "16px",
            display: "flex",
            alignItems: "center"
          }}>
            <svg style={{marginRight: "8px", height: "20px", width: "20px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Reset Your Password
          </h3>
          
          {message.text && (
            <div style={{
              padding: "12px",
              marginBottom: "16px",
              borderRadius: "4px",
              fontSize: "14px",
              backgroundColor: message.type === 'error' ? "#FEF2F2" : "#ECFDF5",
              color: message.type === 'error' ? "#B91C1C" : "#065F46",
              borderLeft: `4px solid ${message.type === 'error' ? "#EF4444" : "#10B981"}`
            }}>
              {message.text}
            </div>
          )}
          
          <p style={{
            fontSize: "14px",
            color: "#6B7280",
            marginBottom: "20px"
          }}>
            Enter your email address and we'll send you instructions to reset your password.
          </p>
          
          <form onSubmit={handleForgotPassword}>
            <div style={{marginBottom: "20px"}}>
              <label 
                htmlFor="reset-email"
                style={{ 
                  display: "block", 
                  fontSize: "14px", 
                  fontWeight: "500", 
                  color: "#4B5563", 
                  marginBottom: "6px" 
                }}
              >
                Email
              </label>
              <input 
                type="email" 
                id="reset-email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                style={{ 
                  width: "100%",
                  border: "1px solid #D1D5DB",
                  borderRadius: "4px",
                  padding: "8px 12px",
                  fontSize: "14px",
                  color: "#374151",
                  outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              />
            </div>
            
            <div style={{display: "flex", justifyContent: "flex-end", gap: "10px"}}>
              <button 
                type="button" 
                onClick={() => setForgotPassword(false)}
                style={{
                  backgroundColor: "#F3F4F6",
                  padding: "8px 16px",
                  color: "#374151",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer"
                }}
              >
                Back to Login
              </button>
              
              <button 
                type="submit" 
                disabled={loading}
                style={{
                  backgroundColor: "#4F46E5",
                  padding: "8px 16px",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "14px",
                  fontWeight: "500",
                  display: "flex",
                  alignItems: "center",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Reset Password'
                )}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default Login; 