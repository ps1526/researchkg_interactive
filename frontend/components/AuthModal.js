import React from 'react';
import Login from './Login';
import Modal from './Modal';

const AuthModal = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <Login onClose={onClose} />
    </Modal>
  );
};

export default AuthModal; 