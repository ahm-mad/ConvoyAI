import React, { useState, useEffect } from 'react';
import { useNavigate } from '@lib/router-compat';
import { useTranslation } from 'react-i18next';
import { get, post } from '../utils/apiHelper';
import toast from 'react-hot-toast';
import { disconnectSocket } from '@contexts/SocketContext';
import { useUser } from '@contexts/UserContext';

export default function RightSidebar({ items = [], setRightSidebarOpen, rightSidebarOpen }) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const { user, handleLogout } = useUser();
  // const user = JSON.parse(localStorage.getItem('user'));
  // const [selectedLanguage, setSelectedLanguage] = useState(
  //   i18n.language === 'ar' ? '' : 'English'
  // );

  // useEffect(() => {
  //   const fetchData = async () => {
  //     try {
  //       const response = await get('/api/settings/user');
  //       if(response?.success){
  //         const language = response?.data[0]?.locale
  //         i18n.changeLanguage(language);
  //       }

  //     } catch (error) {
  //       console.log('error::', error);
  //     }
  //   };

  //   fetchData();
  // }, []);

  // useEffect(() => {
  //   const storedLanguage = localStorage.getItem('selectedLanguage');
  //   if (storedLanguage === 'Arabic' && i18n.language !== 'ar') {
  //     i18n.changeLanguage('ar');
  //   } else if (storedLanguage === 'English' && i18n.language !== 'en') {
  //     i18n.changeLanguage('en');
  //   }
  // }, [i18n]);

  useEffect(() => {
    if (!rightSidebarOpen) {
      setLanguageMenuOpen(false);
    }
  }, [rightSidebarOpen]);

  const handleItemClick = item => {
    if (item.key === 'logout') {
      // localStorage.removeItem("token");
      // if (user) disconnectSocket(user?.id);
      // localStorage.clear();
      // sessionStorage.clear();
      // navigate('/login');
      setRightSidebarOpen(false);
      handleLogout();
    } else if (item.key === 'language') {
      setLanguageMenuOpen(!languageMenuOpen);
    } else {
      navigate(item.route);
      setRightSidebarOpen(false);
    }
  };

  const handleLanguageChange = async locale => {
    // const locale = language === 'English' ? 'en' : 'ar';

    // setSelectedLanguage(language);
    setLanguageMenuOpen(false);
    setRightSidebarOpen(false);
    // localStorage.setItem('selectedLanguage', language);
    i18n.changeLanguage(locale);

    try {
      await post('/api/settings/user/update', { locale });
    } catch (error) {
      console.error('Failed to update language:', error);
    }

    // console.log(`Language ${language}`);
  };

  return (
    <>
      <div
        className={`fixed top-0 right-0 h-screen w-screen z-20 bg-black/50 transition-opacity duration-300
                ${rightSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => {
          setRightSidebarOpen(false);
        }}
      ></div>

      <div
        className={`fixed flex flex-col gap-7 pt-8 top-0  transition-transform duration-300 ease-in-out right-0 h-screen w-72 z-50 bg-white
                ${rightSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {items?.map((item, index) => {
          return (
            <div key={index} className="relative">
              <div
                className="flex pl-4 items-center text-text-light hover:cursor-pointer hover:text-primary"
                onClick={() => handleItemClick(item)}
              >
                <item.icon fontSize="medium" className="text-inherit mr-5" />
                <span className="font-semibold text-sm">{item.text}</span>
              </div>

              {item.key === 'language' && languageMenuOpen && (
                <div className="absolute left-16 mt-2 w-40 bg-white rounded-md shadow-lg z-50 border border-gray-200">
                  <div className="py-1">
                    <div
                      className={`px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer flex items-center ${i18n.language === 'en' ? 'text-primary font-medium' : 'text-gray-700'}`}
                      onClick={() => handleLanguageChange('en')}
                    >
                      <span className="w-4 h-4 mr-2">
                        {i18n.language === 'en' && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                      </span>
                      English
                    </div>
                    <div
                      className={`px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer flex items-center ${i18n.language === 'ar' ? 'text-primary font-medium' : 'text-gray-700'}`}
                      onClick={() => handleLanguageChange('ar')}
                    >
                      <span className="w-4 h-4 mr-2">
                        {i18n.language === 'ar' && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                      </span>
                      العربية
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
