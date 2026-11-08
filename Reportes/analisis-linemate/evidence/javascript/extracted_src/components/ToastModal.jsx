import React from "react";
import "./ToastModal.scss";
import Button from "./Button";
import { useTranslation } from 'react-i18next';

const ToastModal = ({ isVisible, onClose }) => {
  const { t } = useTranslation();
  if (!isVisible) return null;

  return (
    <div className='toast-modal-overlay'>
      <div className='toast-modal-container'>
        <div className='toast-modal-content'>
          <div className='toast-modal-header'>
            <div className='toast-modal-title'>{t('web.toastModal.title')}</div>
          </div>
          <div className='toast-modal-image-section'>
            {/* TODO: replace */}
            <img
              className='toast-modal-image-left'
              src='https://placehold.co/190x290'
              alt='Placeholder 1'
            />
            <img
              className='toast-modal-image-right'
              src='https://placehold.co/320x110'
              alt='Placeholder 2'
            />
          </div>
          <div className='toast-modal-description'>
            <ul>
              <li>{t('web.toastModal.items.checkout')}</li>
              <li>{t('web.toastModal.items.preferredOdds')}</li>
            </ul>
          </div>
        </div>
        <div className='toast-modal-actions'>
          <Button
            text={t('web.toastModal.actions.dismiss')}
            typography='sm'
            type='invisible'
            enabled={true}
            onClick={onClose}
          />
          <Button
            text={t('userProfile.actions.choosePreferredOdds')}
            typography='sm'
            type='primary'
            enabled={true}
          />
        </div>
      </div>
    </div>
  );
};

export default ToastModal;