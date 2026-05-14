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
  const [accountNameFilter, setAccountNameFilter] = useState('');
  const [depositedFilter, setDepositedFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentCheck, setCurrentCheck] = useState(null);
  const [selectedCheckId, setSelectedCheckId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    bank_name: '',
    account_name: '',
    pay_to_the_order_of: '',
    amount: '',
    date: '',
    cr: '',
    cr_date: '',
    invoice_no: '',
    account_no: '',
    check_no: ''
  });
  const [receivedModalOpen, setReceivedModalOpen] = useState(false);
  const [receivedCheckId, setReceivedCheckId] = useState(null);
  const [receivedDate, setReceivedDate] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  
  // Get user role from localStorage
  const userRole = localStorage.getItem('userRole') || 'admin';
  const isViewer = userRole === 'viewer';
  
  // Inline editing states (only for admin)
  const [tempDateDeposited, setTempDateDeposited] = useState({});
  const [tempBankDeposited, setTempBankDeposited] = useState({});
  const [tempDepositedBy, setTempDepositedBy] = useState({});
  const [savingFields, setSavingFields] = useState({});
  
  const tableWrapperRef = useRef(null);
  
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

  // Keyboard navigation for horizontal scrolling - faster scrolling
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only handle arrow keys when the checks tab is active
      if (activeTab !== 'checks') return;
      
      // Don't interfere with typing in input fields
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
        return;
      }
      
      const wrapper = tableWrapperRef.current;
      if (!wrapper) return;
      
      const scrollAmount = 200; // pixels to scroll per key press - faster
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        wrapper.scrollLeft -= scrollAmount;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        wrapper.scrollLeft += scrollAmount;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab]);

  // Row selection with toggle functionality (only for admin)
  const handleRowSelect = (checkId) => {
    if (isViewer) return; // Viewers cannot select rows
    if (selectedCheckId === checkId) {
      setSelectedCheckId(null);
    } else {
      setSelectedCheckId(checkId);
    }
  };

  const handleEditSelected = () => {
    if (isViewer) {
      showToast('Viewer mode: You do not have permission to edit', 'warning');
      return;
    }
    if (!selectedCheckId) {
      showToast('Please select a check first by clicking on a row', 'warning');
      return;
    }
    const selectedCheck = filteredChecks.find(check => check._id === selectedCheckId);
    if (selectedCheck) {
      openEditModal(selectedCheck);
    }
  };

  const handleDeleteSelected = async () => {
    if (isViewer) {
      showToast('Viewer mode: You do not have permission to delete', 'warning');
      return;
    }
    if (!selectedCheckId) {
      showToast('Please select a check first by clicking on a row', 'warning');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this check? This action cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/api/checks/${selectedCheckId}`);
      setSelectedCheckId(null);
      await refreshData();
      showToast('Check deleted successfully', 'success');
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Failed to delete check', 'error');
    }
  };

  const handleMarkNotReceivedSelected = async () => {
    if (isViewer) {
      showToast('Viewer mode: You do not have permission to modify status', 'warning');
      return;
    }
    if (!selectedCheckId) {
      showToast('Please select a check first by clicking on a row', 'warning');
      return;
    }
    const selectedCheck = filteredChecks.find(check => check._id === selectedCheckId);
    if (!selectedCheck?.is_received) {
      showToast('This check is already marked as not received', 'info');
      return;
    }
    if (!window.confirm('Mark this check as not received? This will clear the received date and received by information.')) return;
    try {
      await axios.put(`${API_URL}/api/checks/${selectedCheckId}/unreceived`);
      setSelectedCheckId(null);
      await refreshData();
      showToast('Check marked as not received', 'success');
    } catch (error) {
      console.error('Error marking not received:', error);
      showToast('Failed to update check status', 'error');
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
      // Only set temp states for admin
      if (!isViewer) {
        const dateDepositedMap = {};
        const bankDepositedMap = {};
        const depositedByMap = {};
        response.data.forEach(check => {
          dateDepositedMap[check._id] = check.date_deposited || '';
          bankDepositedMap[check._id] = check.bank_deposited || '';
          depositedByMap[check._id] = check.deposited_by || '';
        });
        setTempDateDeposited(dateDepositedMap);
        setTempBankDeposited(bankDepositedMap);
        setTempDepositedBy(depositedByMap);
      }
    } catch (error) {
      console.error('Error fetching checks:', error);
      showToast('Failed to load checks. Make sure backend is running.', 'error');
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

  const clearAccountNameFilter = () => {
    setAccountNameFilter('');
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

    if (accountNameFilter && accountNameFilter.trim()) {
      const searchTerm = accountNameFilter.trim().toLowerCase();
      result = result.filter(check => 
        check.account_name && check.account_name.toLowerCase().includes(searchTerm)
      );
    }

    if (depositedFilter === 'deposited') {
      result = result.filter(check => check.date_deposited && check.date_deposited.trim() !== '');
    } else if (depositedFilter === 'not_deposited') {
      result = result.filter(check => !check.date_deposited || check.date_deposited.trim() === '');
    }

    setFilteredChecks(result);
    setSelectedCheckId(null);
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
          console.log('SSE connection established successfully');
          reconnectAttempts = 0;
        };
        
        eventSource.onmessage = (event) => {
          try {
            const newNotification = JSON.parse(event.data);
            console.log('New notification received:', newNotification);
            
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
          console.error('SSE error:', error);
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
  }, [filterStatus, scanDate, depositedDate, receivedDateFilter, accountNameFilter, depositedFilter, checks]);

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('full_name');
    localStorage.removeItem('userRole');
    navigate('/login');
  };

  const saveDateDeposited = async (checkId) => {
    if (isViewer) {
      showToast('Viewer mode: You do not have permission to edit', 'warning');
      return;
    }
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
    if (isViewer) {
      showToast('Viewer mode: You do not have permission to edit', 'warning');
      return;
    }
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
    if (isViewer) {
      showToast('Viewer mode: You do not have permission to edit', 'warning');
      return;
    }
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
    if (isViewer) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'date_deposited') {
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
      bank_name: check.bank_name || '',
      account_name: check.account_name || '',
      pay_to_the_order_of: check.pay_to_the_order_of || '',
      amount: check.amount || '',
      date: check.date || '',
      cr: check.cr || '',
      cr_date: check.cr_date || '',
      invoice_no: check.invoice_no || '',
      account_no: check.account_no || '',
      check_no: check.check_no || ''
    });
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setCurrentCheck(null);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (isViewer) {
      showToast('Viewer mode: You do not have permission to edit', 'warning');
      return;
    }
    if (!currentCheck) return;
    try {
      await axios.put(`${API_URL}/api/checks/${currentCheck._id}`, editFormData);
      await refreshData();
      closeEditModal();
      showToast('Check updated successfully', 'success');
    } catch (error) {
      console.error('Update error:', error);
      showToast('Failed to update check: ' + (error.response?.data?.detail || error.message), 'error');
    }
  };

  const openReceivedModal = (checkId) => {
    if (isViewer) {
      showToast('Viewer mode: You do not have permission to mark received', 'warning');
      return;
    }
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
    if (isViewer) {
      showToast('Viewer mode: You do not have permission to mark received', 'warning');
      return;
    }
    if (!receivedCheckId || !receivedDate || !receivedBy) {
      showToast('Please fill in both received date and received by fields', 'error');
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
      showToast('Failed to mark check', 'error');
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
      showToast('No data to export', 'warning');
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
      'Date Deposited': check.date_deposited ? formatDateToMMDDYY(check.date_deposited) : '',
      'Bank Deposited': check.bank_deposited || '',
      'Deposited By': check.deposited_by || ''
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
    setSelectedCheckId(checkId);
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
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : 'ℹ'}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}

      {/* Viewer mode indicator */}
      {isViewer && (
        <div className="viewer-banner">
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
            {isViewer && <span className="viewer-badge">Viewer</span>}
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
          {selectedCheckId && !isViewer && (
            <div className="stat-item selected-check">
              <span className="stat-label-compact">Selected Check:</span>
              <span className="selected-check-number">#{filteredChecks.find(c => c._id === selectedCheckId)?.check_no || '-'}</span>
            </div>
          )}
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
          <>
            {/* Only show action bar for admin users */}
            {!isViewer && (
              <div className="action-bar">
                <div className="action-buttons">
                  <button 
                    onClick={handleEditSelected} 
                    className="action-btn edit-btn"
                    disabled={!selectedCheckId}
                  >
                    Edit
                  </button>
                  <button 
                    onClick={handleDeleteSelected} 
                    className="action-btn delete-btn"
                    disabled={!selectedCheckId}
                  >
                    Delete
                  </button>
                  <button 
                    onClick={handleMarkNotReceivedSelected} 
                    className="action-btn unreceive-btn"
                    disabled={!selectedCheckId || !filteredChecks.find(c => c._id === selectedCheckId)?.is_received}
                  >
                    Not Received
                  </button>
                </div>
                <div className="selection-hint">
                  {selectedCheckId ? (
                    <span className="selected-info">Check #{filteredChecks.find(c => c._id === selectedCheckId)?.check_no} selected - Click row again to unselect</span>
                  ) : (
                    <span className="hint-text">Click on any row to select a check, then use the buttons above</span>
                  )}
                </div>
              </div>
            )}

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
                <span className="filter-label">Deposited:</span>
                <div className="status-filter">
                  <button
                    className={`filter-button ${depositedFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setDepositedFilter('all')}
                  >
                    All
                  </button>
                  <button
                    className={`filter-button ${depositedFilter === 'deposited' ? 'active' : ''}`}
                    onClick={() => setDepositedFilter('deposited')}
                  >
                    Deposited
                  </button>
                  <button
                    className={`filter-button ${depositedFilter === 'not_deposited' ? 'active' : ''}`}
                    onClick={() => setDepositedFilter('not_deposited')}
                  >
                    Not Deposited
                  </button>
                </div>
              </div>

              <div className="filter-group">
                <span className="filter-label">Account Name:</span>
                <div className="account-filter-wrapper">
                  <input
                    type="text"
                    value={accountNameFilter}
                    onChange={(e) => setAccountNameFilter(e.target.value)}
                    placeholder="Type account name to filter..."
                    className="account-name-input"
                  />
                  {accountNameFilter && (
                    <button onClick={clearAccountNameFilter} className="clear-filter-button" title="Clear account name filter">
                      ×
                    </button>
                  )}
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
          </>
        )}
      </div>

      <div className="scrollable-content">
        {activeTab === 'checks' ? (
          <>
            {filteredChecks.length === 0 ? (
              <div className="empty-state">No checks saved yet. Use the mobile app to scan and save checks.</div>
            ) : (
              <div 
                className="table-wrapper" 
                ref={tableWrapperRef}
                style={{ overflowX: 'auto', cursor: 'default' }}
              >
                <table className="checks-table">
                  <thead>
                    <tr>
                      {!isViewer && <th style={{ width: '30px' }}></th>}
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
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChecks.map((check) => (
                      <tr 
                        key={check._id} 
                        id={`check-row-${check._id}`}
                        className={selectedCheckId === check._id && !isViewer ? 'selected-row' : ''}
                        onClick={() => handleRowSelect(check._id)}
                        style={{ cursor: !isViewer ? 'pointer' : 'default' }}
                      >
                        {!isViewer && (
                          <td className="radio-cell">
                            <div className={`custom-radio ${selectedCheckId === check._id ? 'selected' : ''}`}>
                              {selectedCheckId === check._id && <span className="radio-check">✓</span>}
                            </div>
                           </td>
                        )}
                        <td>{formatDate(check.created_at)}</td>
                        <td className="image-cell">
                          {check.image_url ? (
                            <img 
                              src={check.image_url} 
                              alt="Check" 
                              className="thumbnail clickable-image" 
                              onClick={(e) => {
                                e.stopPropagation();
                                openImageModal(check.image_url);
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                          ) : '-'}
                        </td>
                        <td>{check.user_full_name || '-'}</td>
                        <td>{check.bank_name || '-'}</td>
                        <td className="account-name-cell">{check.account_name || '-'}</td>
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
                            !isViewer ? (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openReceivedModal(check._id);
                                }} 
                                className="mark-received-button"
                              >
                                Mark Received
                              </button>
                            ) : (
                              <span className="not-received-badge">Not Received</span>
                            )
                          )}
                        </td>
                        <td>{formatDate(check.received_date)}</td>
                        <td>{check.received_by || '-'}</td>
                        <td className="editable-cell-container">
                          {!isViewer ? (
                            <input
                              ref={el => inputRefs.current[`date_deposited-${check._id}`] = el}
                              type="date"
                              value={formatDateForInput(tempDateDeposited[check._id] || '')}
                              onChange={(e) => {
                                e.stopPropagation();
                                const newValue = e.target.value;
                                setTempDateDeposited(prev => ({ ...prev, [check._id]: newValue }));
                              }}
                              onKeyPress={(e) => handleKeyPress(e, check._id, 'date_deposited')}
                              className="inline-date-input"
                              placeholder="Select date"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="readonly-value">{formatDate(check.date_deposited)}</span>
                          )}
                          {!isViewer && savingFields[`date_deposited-${check._id}`] && <span className="saving-indicator">Saving...</span>}
                        </td>
                        <td className="editable-cell-container">
                          {!isViewer ? (
                            <input
                              ref={el => inputRefs.current[`bank_deposited-${check._id}`] = el}
                              type="text"
                              value={tempBankDeposited[check._id] || ''}
                              onChange={(e) => {
                                e.stopPropagation();
                                const newValue = e.target.value;
                                setTempBankDeposited(prev => ({ ...prev, [check._id]: newValue }));
                              }}
                              onKeyPress={(e) => handleKeyPress(e, check._id, 'bank_deposited')}
                              className="inline-text-input"
                              placeholder="Enter bank name"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="readonly-value">{check.bank_deposited || '-'}</span>
                          )}
                        </td>
                        <td className="editable-cell-container">
                          {!isViewer ? (
                            <input
                              ref={el => inputRefs.current[`deposited_by-${check._id}`] = el}
                              type="text"
                              value={tempDepositedBy[check._id] || ''}
                              onChange={(e) => {
                                e.stopPropagation();
                                const newValue = e.target.value;
                                setTempDepositedBy(prev => ({ ...prev, [check._id]: newValue }));
                              }}
                              onKeyPress={(e) => handleKeyPress(e, check._id, 'deposited_by')}
                              className="inline-text-input"
                              placeholder="Enter name"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="readonly-value">{check.deposited_by || '-'}</span>
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

      {/* Image Modal */}
      {imageModalOpen && (
        <div className="modal-overlay" onClick={closeImageModal}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="image-modal-close" onClick={closeImageModal}>×</button>
            <img src={selectedImage} alt="Check Preview" className="full-image" />
          </div>
        </div>
      )}

      {/* Edit Modal - Only for admin */}
      {!isViewer && editModalOpen && currentCheck && (
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
                  className="edit-input"
                />
              </div>
              <div className="form-group">
                <label>Account Name</label>
                <input
                  type="text"
                  value={editFormData.account_name}
                  onChange={(e) => setEditFormData({ ...editFormData, account_name: e.target.value })}
                  placeholder="Enter account name"
                  className="edit-input"
                />
              </div>
              <div className="form-group">
                <label>Account No.</label>
                <input
                  type="text"
                  value={editFormData.account_no}
                  onChange={(e) => setEditFormData({ ...editFormData, account_no: e.target.value })}
                  placeholder="Enter account number"
                  className="edit-input"
                />
              </div>
              <div className="form-group">
                <label>Check No.</label>
                <input
                  type="text"
                  value={editFormData.check_no}
                  onChange={(e) => setEditFormData({ ...editFormData, check_no: e.target.value })}
                  placeholder="Enter check number"
                  className="edit-input"
                />
              </div>
              <div className="form-group">
                <label>Pay To</label>
                <input
                  type="text"
                  value={editFormData.pay_to_the_order_of}
                  onChange={(e) => setEditFormData({ ...editFormData, pay_to_the_order_of: e.target.value })}
                  placeholder="Enter payee name"
                  className="edit-input"
                />
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="text"
                  value={editFormData.amount}
                  onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                  placeholder="Enter amount"
                  className="edit-input"
                />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="text"
                  value={editFormData.date}
                  onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                  placeholder="MM/DD/YY"
                  className="edit-input"
                />
              </div>
              <div className="form-group">
                <label>CR No.</label>
                <input
                  type="text"
                  value={editFormData.cr}
                  onChange={(e) => setEditFormData({ ...editFormData, cr: e.target.value })}
                  placeholder="Enter CR number"
                  className="edit-input"
                />
              </div>
              <div className="form-group">
                <label>CR Date</label>
                <input
                  type="text"
                  value={editFormData.cr_date}
                  onChange={(e) => setEditFormData({ ...editFormData, cr_date: e.target.value })}
                  placeholder="MM/DD/YY"
                  className="edit-input"
                />
              </div>
              <div className="form-group">
                <label>Invoice No.</label>
                <input
                  type="text"
                  value={editFormData.invoice_no}
                  onChange={(e) => setEditFormData({ ...editFormData, invoice_no: e.target.value })}
                  placeholder="Enter invoice number"
                  className="edit-input"
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

      {/* Received Modal - Only for admin */}
      {!isViewer && receivedModalOpen && (
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
