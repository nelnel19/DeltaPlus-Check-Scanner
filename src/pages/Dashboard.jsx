import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import '../styles/dashboard.css';

const API_URL = 'http://10.80.10.13:8000';

function Dashboard() {
  const [activeTab, setActiveTab] = useState('checks');
  const [checks, setChecks] = useState([]);
  const [filteredChecks, setFilteredChecks] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [scanDate, setScanDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentCheck, setCurrentCheck] = useState(null);
  const [editFormData, setEditFormData] = useState({
    account_name: '',
    pay_to_the_order_of: '',
    amount: '',
    date: '',
    cr: '',
    cr_date: '',
    date_deposited: '',
    bank_deposited: ''
  });
  const [receivedModalOpen, setReceivedModalOpen] = useState(false);
  const [receivedCheckId, setReceivedCheckId] = useState(null);
  const [receivedDate, setReceivedDate] = useState('');
  const navigate = useNavigate();
  const refreshTimeoutRef = useRef(null);
  const eventSourceRef = useRef(null);

  const showToast = (message, type = 'info') => {
    console.log('Showing toast:', message, type);
    setToast({ message, visible: true, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/notifications/unread-count`);
      setUnreadCount(res.data.unread);
    } catch (err) {
      console.error('Failed to fetch unread count', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.put(`${API_URL}/api/notifications/mark-read`);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      showToast('All notifications marked as read', 'success');
    } catch (err) {
      console.error('Failed to mark read', err);
    }
  };

  const markNotificationAsRead = async (notificationId) => {
    try {
      await axios.put(`${API_URL}/api/notifications/${notificationId}/read`);
      setNotifications(prev => prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    }
  };

  const clearAllNotifications = async () => {
    if (!window.confirm('Are you sure you want to clear all notification history?')) return;
    try {
      await axios.delete(`${API_URL}/api/notifications/clear`);
      setNotifications([]);
      setUnreadCount(0);
      showToast('All notifications cleared', 'success');
    } catch (err) {
      console.error('Failed to clear notifications', err);
    }
  };

  const fetchChecks = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/checks`);
      setChecks(response.data);
    } catch (error) {
      console.error('Error fetching checks:', error);
      alert('Failed to load checks. Make sure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/notifications`);
      setNotifications(response.data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const applyFilters = () => {
    let result = [...checks];

    if (filterStatus === 'received') {
      result = result.filter(check => check.is_received === true);
    } else if (filterStatus === 'not_received') {
      result = result.filter(check => check.is_received === false);
    }

    if (scanDate) {
      const selectedDate = new Date(scanDate);
      selectedDate.setHours(0, 0, 0, 0);
      result = result.filter(check => {
        const checkDate = new Date(check.created_at);
        checkDate.setHours(0, 0, 0, 0);
        return checkDate.getTime() === selectedDate.getTime();
      });
    }

    setFilteredChecks(result);
  };

  const clearDateFilter = () => {
    setScanDate('');
  };

  const refreshData = async () => {
    await fetchChecks();
    await fetchNotifications();
    await fetchUnreadCount();
  };

  // Initial data fetch
  useEffect(() => {
    if (!localStorage.getItem('isLoggedIn')) {
      navigate('/login');
      return;
    }
    
    refreshData();
    
    // Auto-refresh every 10 seconds
    const intervalId = setInterval(() => {
      refreshData();
    }, 10000);
    
    return () => {
      clearInterval(intervalId);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [navigate]);

  // SSE for real-time notifications with toast popups
  useEffect(() => {
    let reconnectTimeout = null;
    let reconnectAttempts = 0;
    
    const connectSSE = () => {
      try {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
        
        console.log('Connecting to SSE stream...');
        const eventSource = new EventSource(`${API_URL}/api/notifications/stream`);
        eventSourceRef.current = eventSource;
        
        eventSource.onopen = () => {
          console.log('✅ SSE connection established successfully');
          reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        };
        
        eventSource.onmessage = (event) => {
          try {
            const newNotification = JSON.parse(event.data);
            console.log('🔔 New notification received:', newNotification);
            
            // Add to notification history
            setNotifications(prev => [newNotification, ...prev]);
            
            // Show toast popup for real-time alert
            showToast(newNotification.message, 'info');
            
            // Play notification sound (optional)
            // const audio = new Audio('/notification.mp3');
            // audio.play().catch(e => console.log('Audio play failed:', e));
            
            // Update unread count
            if (!newNotification.read) {
              setUnreadCount(prev => prev + 1);
            }
            
            // Refresh checks immediately when new check arrives
            if (newNotification.message.includes('new check')) {
              if (refreshTimeoutRef.current) {
                clearTimeout(refreshTimeoutRef.current);
              }
              refreshTimeoutRef.current = setTimeout(() => {
                fetchChecks();
                refreshTimeoutRef.current = null;
              }, 500);
            }
          } catch (err) {
            console.error('Error processing notification:', err);
          }
        };
        
        eventSource.onerror = (error) => {
          console.error('❌ SSE error:', error);
          eventSource.close();
          
          // Exponential backoff reconnect
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          console.log(`Attempting to reconnect in ${delay}ms...`);
          
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts++;
            connectSSE();
          }, delay);
        };
      } catch (err) {
        console.error('Failed to create EventSource:', err);
      }
    };
    
    connectSSE();
    
    return () => {
      if (eventSourceRef.current) {
        console.log('Closing SSE connection');
        eventSourceRef.current.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filterStatus, scanDate, checks]);

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('full_name');
    navigate('/login');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this check?')) return;
    try {
      await axios.delete(`${API_URL}/api/checks/${id}`);
      await refreshData();
      showToast('Check deleted successfully', 'success');
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete check');
    }
  };

  const openEditModal = (check) => {
    setCurrentCheck(check);
    setEditFormData({
      account_name: check.account_name || '',
      pay_to_the_order_of: check.pay_to_the_order_of || '',
      amount: check.amount || '',
      date: check.date || '',
      cr: check.cr || '',
      cr_date: check.cr_date || '',
      date_deposited: check.date_deposited || '',
      bank_deposited: check.bank_deposited || ''
    });
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setCurrentCheck(null);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!currentCheck) return;
    try {
      await axios.put(`${API_URL}/api/checks/${currentCheck.id}`, editFormData);
      await refreshData();
      closeEditModal();
      showToast('Check updated successfully', 'success');
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update check');
    }
  };

  const openReceivedModal = (checkId) => {
    const today = new Date().toISOString().split('T')[0];
    setReceivedDate(today);
    setReceivedCheckId(checkId);
    setReceivedModalOpen(true);
  };

  const closeReceivedModal = () => {
    setReceivedModalOpen(false);
    setReceivedCheckId(null);
    setReceivedDate('');
  };

  const handleMarkReceived = async () => {
    if (!receivedCheckId || !receivedDate) return;
    try {
      const formData = new FormData();
      formData.append('received_date', receivedDate);
      await axios.put(`${API_URL}/api/checks/${receivedCheckId}/received`, formData);
      await refreshData();
      closeReceivedModal();
      showToast('Check marked as received', 'success');
    } catch (error) {
      console.error('Error marking received:', error);
      alert('Failed to mark check');
    }
  };

  const handleUnmarkReceived = async (checkId) => {
    if (!window.confirm('Unmark this check as received?')) return;
    try {
      await axios.put(`${API_URL}/api/checks/${checkId}/unreceived`);
      await refreshData();
      showToast('Check unmarked as received', 'success');
    } catch (error) {
      console.error('Error unmarking:', error);
      alert('Failed to unmark check');
    }
  };

  const exportToExcel = () => {
    if (filteredChecks.length === 0) {
      alert('No data to export');
      return;
    }

    const exportData = filteredChecks.map(check => ({
      ID: check.id,
      'Saved By': check.user_full_name || '',
      'Bank Name': check.bank_name || '',
      'Account Name': check.account_name || '',
      'Account No.': check.account_no || '',
      'Check No.': check.check_no || '',
      'Pay To': check.pay_to_the_order_of || '',
      Amount: check.amount || '',
      Date: check.date || '',
      Status: check.is_received ? 'Received' : 'Not Received',
      'Received Date': check.received_date || '',
      CR: check.cr || '',
      'CR Date': check.cr_date || '',
      'Date Deposited': check.date_deposited || '',
      'Bank Deposited': check.bank_deposited || '',
      'Date of Scan': new Date(check.created_at).toLocaleString()
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const maxWidth = 20;
    worksheet['!cols'] = Object.keys(exportData[0]).map(() => ({ wch: maxWidth }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Checks');

    const fileName = `checks_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast('Export completed successfully', 'success');
  };

  const handleNotificationClick = (checkId) => {
    setActiveTab('checks');
    setTimeout(() => {
      const row = document.getElementById(`check-row-${checkId}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('highlight-row');
        setTimeout(() => {
          row.classList.remove('highlight-row');
        }, 2000);
      } else {
        if (filterStatus !== 'all') {
          setFilterStatus('all');
          setTimeout(() => {
            const rowAgain = document.getElementById(`check-row-${checkId}`);
            if (rowAgain) {
              rowAgain.scrollIntoView({ behavior: 'smooth', block: 'center' });
              rowAgain.classList.add('highlight-row');
              setTimeout(() => rowAgain.classList.remove('highlight-row'), 2000);
            }
          }, 500);
        }
      }
    }, 100);
  };

  const totalChecks = filteredChecks.length;
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatTimestamp = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-PH');
  };

  if (loading) return <div className="loading-state">Loading checks...</div>;

  return (
    <div className="dashboard-container">
      {/* Toast Popup Notification */}
      {toast && toast.visible && (
        <div className={`toast-notification ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : '🔔'}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}

      {/* Sticky Header Section */}
      <div className="sticky-header">
        <div className="dashboard-header">
          <div className="brand">
            <img src="/deltaplus.png" alt="DeltaPlus" className="brand-logo" />
            <span className="brand-text">CHECK SCANNER</span>
          </div>
          <div className="user-info">
            <span className="user-name">{localStorage.getItem('full_name') || 'User'}</span>
            <button onClick={handleLogout} className="logout-button">Sign out</button>
          </div>
        </div>

        <div className="compact-stats">
          <div className="stat-item">
            <span className="stat-value">{totalChecks}</span>
            <span className="stat-label-compact">Total Checks</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <span className="stat-value">{filteredChecks.length > 0 ? formatDate(filteredChecks[0].created_at) : '-'}</span>
            <span className="stat-label-compact">Latest Scan</span>
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab-button ${activeTab === 'checks' ? 'active' : ''}`}
            onClick={() => setActiveTab('checks')}
          >
            All Checks
          </button>
          <button
            className={`tab-button ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            Notifications {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </button>
        </div>

        {/* Filter Section */}
        {activeTab === 'checks' && (
          <div className="filter-section-compact">
            <div className="filter-group">
              <span className="filter-label">Status:</span>
              <div className="status-filter">
                <button
                  className={`filter-button ${filterStatus === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('all')}
                >
                  All
                </button>
                <button
                  className={`filter-button ${filterStatus === 'received' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('received')}
                >
                  Received
                </button>
                <button
                  className={`filter-button ${filterStatus === 'not_received' ? 'active' : ''}`}
                  onClick={() => setFilterStatus('not_received')}
                >
                  Not Received
                </button>
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Scan Date:</span>
              <div className="date-filter-wrapper">
                <input
                  type="date"
                  value={scanDate}
                  onChange={(e) => setScanDate(e.target.value)}
                  className="date-input"
                />
                {scanDate && (
                  <button onClick={clearDateFilter} className="clear-date-button" title="Clear date filter">
                    ×
                  </button>
                )}
              </div>
            </div>

            <button onClick={exportToExcel} className="export-button-compact">
              Export to Excel
            </button>
          </div>
        )}
      </div>

      {/* Scrollable Content Area */}
      <div className="scrollable-content">
        {activeTab === 'checks' ? (
          <>
            {filteredChecks.length === 0 ? (
              <div className="empty-state">No checks saved yet. Use the mobile app to scan and save checks.</div>
            ) : (
              <div className="table-wrapper">
                <table className="checks-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Image</th>
                      <th>Drivers Name</th>
                      <th>Bank Name</th>
                      <th>Account Name</th>
                      <th>Account No.</th>
                      <th>Check No.</th>
                      <th>Pay To</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Received Date Physically</th>
                      <th>CR No.</th>
                      <th>CR Date</th>
                      <th>Date Deposited</th>
                      <th>Bank Deposited</th>
                      <th>Date of Scan</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChecks.map((check) => (
                      <tr key={check.id} id={`check-row-${check.id}`}>
                        <td>{check.id}</td>
                        <td>
                          {check.image_url ? (
                            <a href={check.image_url} target="_blank" rel="noopener noreferrer">
                              <img src={check.image_url} alt="Check" className="thumbnail" />
                            </a>
                          ) : '-'}
                        </td>
                        <td>{check.user_full_name || '-'}</td>
                        <td>{check.bank_name || '-'}</td>
                        <td>{check.account_name || '-'}</td>
                        <td>{check.account_no || '-'}</td>
                        <td className="check-number">{check.check_no || '-'}</td>
                        <td>{check.pay_to_the_order_of || '-'}</td>
                        <td className="amount">{check.amount || '-'}</td>
                        <td>{check.date || '-'}</td>
                        <td>
                          {check.is_received ? (
                            <span className="received-badge">Received</span>
                          ) : (
                            <button onClick={() => openReceivedModal(check.id)} className="mark-received-button">
                              Mark Received
                            </button>
                          )}
                        </td>
                        <td>{check.received_date || '-'}</td>
                        <td>{check.cr || '-'}</td>
                        <td>{check.cr_date || '-'}</td>
                        <td>{check.date_deposited || '-'}</td>
                        <td>{check.bank_deposited || '-'}</td>
                        <td>{formatDate(check.created_at)}</td>
                        <td className="actions">
                          <button onClick={() => openEditModal(check)} className="edit-button">Edit</button>
                          <button onClick={() => handleDelete(check.id)} className="delete-button">Delete</button>
                          {check.is_received && (
                            <button onClick={() => handleUnmarkReceived(check.id)} className="unmark-button">Undo</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="notifications-section">
            <div className="notifications-header">
              <h3 className="dashboard-title">Notification History</h3>
              <div className="notification-actions">
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="mark-all-read-button">
                    Mark All Read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={clearAllNotifications} className="clear-notifications-button">
                    Clear All
                  </button>
                )}
              </div>
            </div>
            {notifications.length === 0 ? (
              <div className="empty-state">No notifications yet. New checks will appear here.</div>
            ) : (
              <div className="notifications-list">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`notification-card ${!notif.read ? 'unread' : ''}`}
                    onClick={() => {
                      if (!notif.read) {
                        markNotificationAsRead(notif.id);
                      }
                      handleNotificationClick(notif.check_id);
                    }}
                  >
                    <div className="notification-message">
                      {!notif.read && <span className="unread-dot"></span>}
                      {notif.message}
                    </div>
                    <div className="notification-time">{formatTimestamp(notif.timestamp)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editModalOpen && currentCheck && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal-content edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Check #{currentCheck.check_no}</h3>
            <form onSubmit={handleEditSubmit} className="modal-form">
              <div className="form-group">
                <label>Account Name</label>
                <input
                  type="text"
                  value={editFormData.account_name}
                  onChange={(e) => setEditFormData({ ...editFormData, account_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Pay To</label>
                <input
                  type="text"
                  value={editFormData.pay_to_the_order_of}
                  onChange={(e) => setEditFormData({ ...editFormData, pay_to_the_order_of: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="text"
                  value={editFormData.amount}
                  onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="text"
                  value={editFormData.date}
                  onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>CR</label>
                <input
                  type="text"
                  value={editFormData.cr}
                  onChange={(e) => setEditFormData({ ...editFormData, cr: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>CR Date</label>
                <input
                  type="date"
                  value={editFormData.cr_date}
                  onChange={(e) => setEditFormData({ ...editFormData, cr_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Date Deposited</label>
                <input
                  type="date"
                  value={editFormData.date_deposited}
                  onChange={(e) => setEditFormData({ ...editFormData, date_deposited: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Bank Deposited</label>
                <input
                  type="text"
                  value={editFormData.bank_deposited}
                  onChange={(e) => setEditFormData({ ...editFormData, bank_deposited: e.target.value })}
                />
              </div>
              <div className="modal-buttons">
                <button type="submit" className="save-button">Save Changes</button>
                <button type="button" onClick={closeEditModal} className="cancel-button">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Received Modal */}
      {receivedModalOpen && (
        <div className="modal-overlay" onClick={closeReceivedModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Mark Check as Received</h3>
            <div className="form-group">
              <label>Received Date</label>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="date-input"
              />
            </div>
            <div className="modal-buttons">
              <button onClick={handleMarkReceived} className="save-button">Confirm</button>
              <button onClick={closeReceivedModal} className="cancel-button">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;