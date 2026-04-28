import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import '../styles/dashboard.css';

const API_URL = 'https://deltaplus-check-scanner-backend.onrender.com';

function Dashboard() {
  const [activeTab, setActiveTab] = useState('checks');
  const [checks, setChecks] = useState([]);
  const [filteredChecks, setFilteredChecks] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [scanDate, setScanDate] = useState('');
  const [depositedDate, setDepositedDate] = useState('');
  const [receivedDateFilter, setReceivedDateFilter] = useState('');
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
    invoice_no: '',
    account_no: '',
    check_no: '',
    bank_name: ''
  });
  const [receivedModalOpen, setReceivedModalOpen] = useState(false);
  const [receivedCheckId, setReceivedCheckId] = useState(null);
  const [receivedDate, setReceivedDate] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  
  // Inline editing states
  const [tempDateDeposited, setTempDateDeposited] = useState({});
  const [tempBankDeposited, setTempBankDeposited] = useState({});
  const [tempDepositedBy, setTempDepositedBy] = useState({});
  const [tempBankName, setTempBankName] = useState({});
  const [savingFields, setSavingFields] = useState({});
  
  // Drag-to-scroll states
  const tableWrapperRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  
  const navigate = useNavigate();
  const refreshTimeoutRef = useRef(null);
  const eventSourceRef = useRef(null);
  const inputRefs = useRef({});

  const showToast = (message, type = 'info') => {
    setToast({ message, visible: true, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // Drag-to-scroll handlers
  const handleMouseDown = (e) => {
    if (tableWrapperRef.current && e.target.closest('.editable-cell-container') === null && e.target.tagName !== 'INPUT') {
      setIsDragging(true);
      setStartX(e.pageX - tableWrapperRef.current.offsetLeft);
      setScrollLeft(tableWrapperRef.current.scrollLeft);
      tableWrapperRef.current.style.cursor = 'grabbing';
      e.preventDefault();
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - tableWrapperRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    tableWrapperRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (tableWrapperRef.current) {
      tableWrapperRef.current.style.cursor = 'grab';
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    if (tableWrapperRef.current) {
      tableWrapperRef.current.style.cursor = 'grab';
    }
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
      const dateDepositedMap = {};
      const bankDepositedMap = {};
      const depositedByMap = {};
      const bankNameMap = {};
      response.data.forEach(check => {
        dateDepositedMap[check._id] = check.date_deposited || '';
        bankDepositedMap[check._id] = check.bank_deposited || '';
        depositedByMap[check._id] = check.deposited_by || '';
        bankNameMap[check._id] = check.bank_name || '';
      });
      setTempDateDeposited(dateDepositedMap);
      setTempBankDeposited(bankDepositedMap);
      setTempDepositedBy(depositedByMap);
      setTempBankName(bankNameMap);
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

    if (depositedDate) {
      const selectedDepositedDate = new Date(depositedDate);
      selectedDepositedDate.setHours(0, 0, 0, 0);
      result = result.filter(check => {
        if (!check.date_deposited) return false;
        const checkDepositedDate = new Date(check.date_deposited);
        checkDepositedDate.setHours(0, 0, 0, 0);
        return checkDepositedDate.getTime() === selectedDepositedDate.getTime();
      });
    }

    if (receivedDateFilter) {
      const selectedReceivedDate = new Date(receivedDateFilter);
      selectedReceivedDate.setHours(0, 0, 0, 0);
      result = result.filter(check => {
        if (!check.received_date) return false;
        const checkReceivedDate = new Date(check.received_date);
        checkReceivedDate.setHours(0, 0, 0, 0);
        return checkReceivedDate.getTime() === selectedReceivedDate.getTime();
      });
    }

    setFilteredChecks(result);
  };

  const clearScanDateFilter = () => {
    setScanDate('');
  };

  const clearDepositedDateFilter = () => {
    setDepositedDate('');
  };

  const clearReceivedDateFilter = () => {
    setReceivedDateFilter('');
  };

  const refreshData = async () => {
    await fetchChecks();
    await fetchNotifications();
    await fetchUnreadCount();
  };

  useEffect(() => {
    if (!localStorage.getItem('isLoggedIn')) {
      navigate('/');
      return;
    }
    
    refreshData();
    
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [navigate]);

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
          reconnectAttempts = 0;
        };
        
        eventSource.onmessage = (event) => {
          try {
            const newNotification = JSON.parse(event.data);
            console.log('🔔 New notification received:', newNotification);
            
            setNotifications(prev => [newNotification, ...prev]);
            showToast(newNotification.message, 'info');
            
            if (!newNotification.read) {
              setUnreadCount(prev => prev + 1);
            }
            
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
  }, [filterStatus, scanDate, depositedDate, receivedDateFilter, checks]);

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('full_name');
    navigate('/login');
  };

  const handleDelete = async (checkId) => {
    if (!window.confirm('Are you sure you want to delete this check? This action cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/api/checks/${checkId}`);
      await refreshData();
      showToast('Check deleted successfully', 'success');
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete check');
    }
  };

  const saveBankName = async (checkId) => {
    const value = tempBankName[checkId];
    setSavingFields(prev => ({ ...prev, [`bank_name-${checkId}`]: true }));
    try {
      await axios.put(`${API_URL}/api/checks/${checkId}`, { bank_name: value });
      setChecks(prevChecks => prevChecks.map(check => 
        check._id === checkId ? { ...check, bank_name: value } : check
      ));
      showToast('Bank name updated successfully', 'success');
    } catch (error) {
      console.error('Update error:', error);
      showToast('Failed to update bank name', 'error');
      const originalCheck = checks.find(c => c._id === checkId);
      setTempBankName(prev => ({ ...prev, [checkId]: originalCheck?.bank_name || '' }));
    } finally {
      setSavingFields(prev => ({ ...prev, [`bank_name-${checkId}`]: false }));
    }
  };

  const saveDateDeposited = async (checkId) => {
    const value = tempDateDeposited[checkId];
    setSavingFields(prev => ({ ...prev, [`date_deposited-${checkId}`]: true }));
    try {
      await axios.put(`${API_URL}/api/checks/${checkId}`, { date_deposited: value });
      setChecks(prevChecks => prevChecks.map(check => 
        check._id === checkId ? { ...check, date_deposited: value } : check
      ));
      showToast('Date deposited updated successfully', 'success');
    } catch (error) {
      console.error('Update error:', error);
      showToast('Failed to update date deposited', 'error');
      const originalCheck = checks.find(c => c._id === checkId);
      setTempDateDeposited(prev => ({ ...prev, [checkId]: originalCheck?.date_deposited || '' }));
    } finally {
      setSavingFields(prev => ({ ...prev, [`date_deposited-${checkId}`]: false }));
    }
  };

  const saveBankDeposited = async (checkId) => {
    const value = tempBankDeposited[checkId];
    setSavingFields(prev => ({ ...prev, [`bank_deposited-${checkId}`]: true }));
    try {
      await axios.put(`${API_URL}/api/checks/${checkId}`, { bank_deposited: value });
      setChecks(prevChecks => prevChecks.map(check => 
        check._id === checkId ? { ...check, bank_deposited: value } : check
      ));
      showToast('Bank deposited updated successfully', 'success');
    } catch (error) {
      console.error('Update error:', error);
      showToast('Failed to update bank deposited', 'error');
      const originalCheck = checks.find(c => c._id === checkId);
      setTempBankDeposited(prev => ({ ...prev, [checkId]: originalCheck?.bank_deposited || '' }));
    } finally {
      setSavingFields(prev => ({ ...prev, [`bank_deposited-${checkId}`]: false }));
    }
  };

  const saveDepositedBy = async (checkId) => {
    const value = tempDepositedBy[checkId];
    setSavingFields(prev => ({ ...prev, [`deposited_by-${checkId}`]: true }));
    try {
      await axios.put(`${API_URL}/api/checks/${checkId}`, { deposited_by: value });
      setChecks(prevChecks => prevChecks.map(check => 
        check._id === checkId ? { ...check, deposited_by: value } : check
      ));
      showToast('Deposited by updated successfully', 'success');
    } catch (error) {
      console.error('Update error:', error);
      showToast('Failed to update deposited by', 'error');
      const originalCheck = checks.find(c => c._id === checkId);
      setTempDepositedBy(prev => ({ ...prev, [checkId]: originalCheck?.deposited_by || '' }));
    } finally {
      setSavingFields(prev => ({ ...prev, [`deposited_by-${checkId}`]: false }));
    }
  };

  const handleKeyPress = (e, checkId, field) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'bank_name') {
        saveBankName(checkId);
      } else if (field === 'date_deposited') {
        saveDateDeposited(checkId);
      } else if (field === 'bank_deposited') {
        saveBankDeposited(checkId);
      } else if (field === 'deposited_by') {
        saveDepositedBy(checkId);
      }
      inputRefs.current[`${field}-${checkId}`]?.blur();
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
      invoice_no: check.invoice_no || '',
      account_no: check.account_no || '',
      check_no: check.check_no || '',
      bank_name: check.bank_name || ''
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
      await axios.put(`${API_URL}/api/checks/${currentCheck._id}`, editFormData);
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
    setReceivedBy('');
    setReceivedCheckId(checkId);
    setReceivedModalOpen(true);
  };

  const closeReceivedModal = () => {
    setReceivedModalOpen(false);
    setReceivedCheckId(null);
    setReceivedDate('');
    setReceivedBy('');
  };

  const handleMarkReceived = async () => {
    if (!receivedCheckId || !receivedDate || !receivedBy) {
      alert('Please fill in both received date and received by fields');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('received_date', receivedDate);
      formData.append('received_by', receivedBy);
      await axios.put(`${API_URL}/api/checks/${receivedCheckId}/received`, formData);
      await refreshData();
      closeReceivedModal();
      showToast('Check marked as received', 'success');
    } catch (error) {
      console.error('Error marking received:', error);
      alert('Failed to mark check');
    }
  };

  const handleMarkNotReceived = async (checkId) => {
    if (!window.confirm('Mark this check as not received? This will clear the received date and received by information.')) return;
    try {
      await axios.put(`${API_URL}/api/checks/${checkId}/unreceived`);
      await refreshData();
      showToast('Check marked as not received', 'success');
    } catch (error) {
      console.error('Error marking not received:', error);
      alert('Failed to update check status');
    }
  };

  const openImageModal = (imageUrl) => {
    setSelectedImage(imageUrl);
    setImageModalOpen(true);
  };

  const closeImageModal = () => {
    setImageModalOpen(false);
    setSelectedImage('');
  };

  const exportToExcel = () => {
    if (filteredChecks.length === 0) {
      alert('No data to export');
      return;
    }

    const exportData = filteredChecks.map(check => ({
      'Date of Scan': formatDateToMMDDYY(check.created_at),
      'Drivers Name': check.user_full_name || '',
      'Bank Name': check.bank_name || '',
      'Account Name': check.account_name || '',
      'Account No.': check.account_no || '',
      'Check No.': check.check_no || '',
      'Pay To': check.pay_to_the_order_of || '',
      'Amount': check.amount || '',
      'Date': check.date ? formatDateToMMDDYY(check.date) : '',
      'CR No.': check.cr || '',
      'CR Date': check.cr_date ? formatDateToMMDDYY(check.cr_date) : '',
      'Invoice No.': check.invoice_no || '',
      'Status': check.is_received ? 'Received' : 'Not Received',
      'Received Date': check.received_date ? formatDateToMMDDYY(check.received_date) : '',
      'Received By': check.received_by || '',
      'Date Deposited': tempDateDeposited[check._id] ? formatDateToMMDDYY(tempDateDeposited[check._id]) : '',
      'Bank Deposited': tempBankDeposited[check._id] || '',
      'Deposited By': tempDepositedBy[check._id] || ''
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
  
  const formatDateToMMDDYY = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  };

  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return formatDateToMMDDYY(dateString);
  };

  const formatTimestamp = (isoString) => {
    const date = new Date(isoString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} ${hours}:${minutes}`;
  };

  const getLatestScanDate = () => {
    if (filteredChecks.length === 0) return '-';
    const latest = filteredChecks.reduce((latest, check) => {
      const checkDate = new Date(check.created_at);
      const latestDate = new Date(latest.created_at);
      return checkDate > latestDate ? check : latest;
    }, filteredChecks[0]);
    return formatDate(latest.created_at);
  };

  if (loading) return <div className="loading-state">Loading checks...</div>;

  return (
    <div className="dashboard-container">
      {toast && toast.visible && (
        <div className={`toast-notification ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : '🔔'}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}

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
            <span className="stat-value">{getLatestScanDate()}</span>
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
                  <button onClick={clearScanDateFilter} className="clear-date-button" title="Clear scan date filter">
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Deposited Date:</span>
              <div className="date-filter-wrapper">
                <input
                  type="date"
                  value={depositedDate}
                  onChange={(e) => setDepositedDate(e.target.value)}
                  className="date-input"
                />
                {depositedDate && (
                  <button onClick={clearDepositedDateFilter} className="clear-date-button" title="Clear deposited date filter">
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">Received Date:</span>
              <div className="date-filter-wrapper">
                <input
                  type="date"
                  value={receivedDateFilter}
                  onChange={(e) => setReceivedDateFilter(e.target.value)}
                  className="date-input"
                />
                {receivedDateFilter && (
                  <button onClick={clearReceivedDateFilter} className="clear-date-button" title="Clear received date filter">
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

      <div className="scrollable-content">
        {activeTab === 'checks' ? (
          <>
            {filteredChecks.length === 0 ? (
              <div className="empty-state">No checks saved yet. Use the mobile app to scan and save checks.</div>
            ) : (
              <div 
                className="table-wrapper drag-scroll" 
                ref={tableWrapperRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: 'grab' }}
              >
                <table className="checks-table">
                  <thead>
                    <tr>
                      <th>Date of Scan</th>
                      <th>Image</th>
                      <th>Uploader</th>
                      <th>Bank Name</th>
                      <th>Account Name</th>
                      <th>Account No.</th>
                      <th>Check No.</th>
                      <th>Pay To</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>CR No.</th>
                      <th>CR Date</th>
                      <th>Invoice No.</th>
                      <th>Status</th>
                      <th>Received Date</th>
                      <th>Received By</th>
                      <th>Date Deposited</th>
                      <th>Bank Deposited</th>
                      <th>Deposited By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChecks.map((check) => (
                      <tr key={check._id} id={`check-row-${check._id}`}>
                        <td>{formatDate(check.created_at)}</td>
                        <td className="image-cell">
                          {check.image_url ? (
                            <img 
                              src={check.image_url} 
                              alt="Check" 
                              className="thumbnail clickable-image" 
                              onClick={() => openImageModal(check.image_url)}
                              style={{ cursor: 'pointer' }}
                            />
                          ) : '-'}
                        </td>
                        <td>{check.user_full_name || '-'}</td>
                        <td className="editable-cell-container">
                          <input
                            ref={el => inputRefs.current[`bank_name-${check._id}`] = el}
                            type="text"
                            value={tempBankName[check._id] || ''}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setTempBankName(prev => ({ ...prev, [check._id]: newValue }));
                            }}
                            onKeyPress={(e) => handleKeyPress(e, check._id, 'bank_name')}
                            className="inline-text-input"
                            placeholder="Enter bank name"
                          />
                          {savingFields[`bank_name-${check._id}`] && <span className="saving-indicator">Saving...</span>}
                        </td>
                        <td>{check.account_name || '-'}</td>
                        <td>{check.account_no || '-'}</td>
                        <td className="check-number">{check.check_no || '-'}</td>
                        <td>{check.pay_to_the_order_of || '-'}</td>
                        <td className="amount">{check.amount || '-'}</td>
                        <td>{formatDate(check.date)}</td>
                        <td>{check.cr || '-'}</td>
                        <td>{formatDate(check.cr_date)}</td>
                        <td>{check.invoice_no || '-'}</td>
                        <td className="status-cell">
                          {check.is_received ? (
                            <span className="received-badge">Received</span>
                          ) : (
                            <button 
                              onClick={() => openReceivedModal(check._id)} 
                              className="mark-received-button"
                            >
                              Mark Received
                            </button>
                          )}
                        </td>
                        <td>{formatDate(check.received_date)}</td>
                        <td>{check.received_by || '-'}</td>
                        <td className="editable-cell-container">
                          <input
                            ref={el => inputRefs.current[`date_deposited-${check._id}`] = el}
                            type="date"
                            value={formatDateForInput(tempDateDeposited[check._id] || '')}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setTempDateDeposited(prev => ({ ...prev, [check._id]: newValue }));
                            }}
                            onKeyPress={(e) => handleKeyPress(e, check._id, 'date_deposited')}
                            className="inline-date-input"
                            placeholder="Select date"
                          />
                          {savingFields[`date_deposited-${check._id}`] && <span className="saving-indicator">Saving...</span>}
                        </td>
                        <td className="editable-cell-container">
                          <input
                            ref={el => inputRefs.current[`bank_deposited-${check._id}`] = el}
                            type="text"
                            value={tempBankDeposited[check._id] || ''}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setTempBankDeposited(prev => ({ ...prev, [check._id]: newValue }));
                            }}
                            onKeyPress={(e) => handleKeyPress(e, check._id, 'bank_deposited')}
                            className="inline-text-input"
                            placeholder="Enter bank name"
                          />
                        </td>
                        <td className="editable-cell-container">
                          <input
                            ref={el => inputRefs.current[`deposited_by-${check._id}`] = el}
                            type="text"
                            value={tempDepositedBy[check._id] || ''}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setTempDepositedBy(prev => ({ ...prev, [check._id]: newValue }));
                            }}
                            onKeyPress={(e) => handleKeyPress(e, check._id, 'deposited_by')}
                            className="inline-text-input"
                            placeholder="Enter name"
                          />
                        </td>
                        <td className="actions">
                          <button onClick={() => openEditModal(check)} className="edit-button" title="Edit check details">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(check._id)} className="delete-button" title="Delete check">
                            Delete
                          </button>
                          <button 
                            onClick={() => handleMarkNotReceived(check._id)} 
                            className={`unmark-button ${check.is_received ? 'active' : 'disabled'}`}
                            title={check.is_received ? "Mark as not received" : "Not received (already not received)"}
                            style={!check.is_received ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                            disabled={!check.is_received}
                          >
                            Not Received
                          </button>
                         </td>
                       </tr>
                    ))}
                  </tbody>
                </table>
                <div className="scroll-hint">← Drag to scroll horizontally →</div>
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

      {/* Image Modal */}
      {imageModalOpen && (
        <div className="modal-overlay" onClick={closeImageModal}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="image-modal-close" onClick={closeImageModal}>×</button>
            <img src={selectedImage} alt="Check Preview" className="full-image" />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && currentCheck && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal-content edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Check #{currentCheck.check_no}</h3>
            <form onSubmit={handleEditSubmit} className="modal-form">
              <div className="form-group">
                <label>Bank Name</label>
                <input
                  type="text"
                  value={editFormData.bank_name}
                  onChange={(e) => setEditFormData({ ...editFormData, bank_name: e.target.value })}
                  placeholder="Enter bank name"
                />
              </div>
              <div className="form-group">
                <label>Account Name</label>
                <input
                  type="text"
                  value={editFormData.account_name}
                  onChange={(e) => setEditFormData({ ...editFormData, account_name: e.target.value })}
                  placeholder="Enter account name"
                />
              </div>
              <div className="form-group">
                <label>Account No.</label>
                <input
                  type="text"
                  value={editFormData.account_no}
                  onChange={(e) => setEditFormData({ ...editFormData, account_no: e.target.value })}
                  placeholder="Enter account number"
                />
              </div>
              <div className="form-group">
                <label>Check No.</label>
                <input
                  type="text"
                  value={editFormData.check_no}
                  onChange={(e) => setEditFormData({ ...editFormData, check_no: e.target.value })}
                  placeholder="Enter check number"
                />
              </div>
              <div className="form-group">
                <label>Pay To</label>
                <input
                  type="text"
                  value={editFormData.pay_to_the_order_of}
                  onChange={(e) => setEditFormData({ ...editFormData, pay_to_the_order_of: e.target.value })}
                  placeholder="Enter payee name"
                />
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="text"
                  value={editFormData.amount}
                  onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                  placeholder="Enter amount"
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="text"
                  value={editFormData.date}
                  onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                  placeholder="MM/DD/YY"
                />
              </div>
              <div className="form-group">
                <label>CR No.</label>
                <input
                  type="text"
                  value={editFormData.cr}
                  onChange={(e) => setEditFormData({ ...editFormData, cr: e.target.value })}
                  placeholder="Enter CR number"
                />
              </div>
              <div className="form-group">
                <label>CR Date</label>
                <input
                  type="text"
                  value={editFormData.cr_date}
                  onChange={(e) => setEditFormData({ ...editFormData, cr_date: e.target.value })}
                  placeholder="MM/DD/YY"
                />
              </div>
              <div className="form-group">
                <label>Invoice No.</label>
                <input
                  type="text"
                  value={editFormData.invoice_no}
                  onChange={(e) => setEditFormData({ ...editFormData, invoice_no: e.target.value })}
                  placeholder="Enter invoice number"
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
              <label>Received Date <span className="required-star">*</span></label>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="date-input"
                required
              />
            </div>
            <div className="form-group">
              <label>Received By <span className="required-star">*</span></label>
              <input
                type="text"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Enter name of person who received"
                className="text-input"
                required
              />
            </div>
            <div className="modal-buttons">
              <button onClick={handleMarkReceived} className="save-button">Confirm Received</button>
              <button onClick={closeReceivedModal} className="cancel-button">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
