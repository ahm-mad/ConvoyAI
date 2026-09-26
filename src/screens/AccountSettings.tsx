/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import Button from '../components/Button';
import InputField from '@components/Input';
import { useTranslation } from 'react-i18next';
import CustomAvatar from '@components/CustomAvatar';
import AddLocation from '@components/AddLocation';
import * as Checkbox from '@radix-ui/react-checkbox';
import { CheckIcon } from '@radix-ui/react-icons';
import Scrollspy from 'react-scrollspy';
import { useUser } from '@contexts/UserContext';
import { resolveImageUrl } from '@utils/avatar';
import type { User } from '../types/api';
import { useForm, Controller } from 'react-hook-form';
import { get, post, del } from '@utils/apiHelper';
import { yupResolver } from '@hookform/resolvers/yup';
import { useNavigate } from '@lib/router-compat';
import { BasicFormSchema, PasswordFormSchema } from '../validation/AccountSettingFormsValidation';
import { useModal } from '@contexts/ModalContext';
import { Card, CardActions, CardContent } from '@components/ui/Card';
import ImageCropModal from '@components/ImageCropModal';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { Eye, EyeOff } from 'lucide-react';

const bull = <span className="mx-0.5 inline-block scale-[0.8]">•</span>;

const DEFAULT_DIAL_CODE = '92';

function toInternationalPhoneValue(raw: any, defaultDialCode: string = DEFAULT_DIAL_CODE) {
  if (!raw) return '';

  let digits = String(raw).replace(/\D/g, '');

  if (!digits) return '';

  if (digits.startsWith(defaultDialCode) && digits.length > defaultDialCode.length + 6) {
    return digits;
  }

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return `${defaultDialCode}${digits}`;
}

function isSocialLoginUser(user: any) {
  return user?.social_provider === 'google';
}

const ScrollSidebar = ({ hidePasswordLink = false }: { hidePasswordLink?: boolean }) => {
  const { t } = useTranslation();

  const handleSmoothScroll = (e: MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const container = document.getElementById('scroll-container');
    const target = document.getElementById(targetId);

    if (container && target) {
      const containerTop = container.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;

      container.scrollTo({
        top: container.scrollTop + (targetTop - containerTop),
        behavior: 'smooth',
      });
    }
  };

  const items = [
    'basic-settings',
    'address',
    ...(hidePasswordLink ? [] : ['password']),
    'delete-account',
  ];

  return (
    <div className="  mt-8 top-31.5 hidden lg:block w-50 h-[calc(100vh-8rem)] overflow-visible pr-4 2xl:-ml-0 ml-5 text-xs z-50">
      <div className="relative pl-8 pt-4">
        <div className="absolute left-3 top-4 bottom-0 w-[1px] bg-line"></div>
        <Scrollspy
          items={items}
          currentClassName="relative text-brand font-medium !bg-brand-wash -ml-12 pl-12 rounded-full
                            before:content-[''] before:absolute before:left-6.5 before:top-1/2 before:-translate-y-1/2
                            before:w-1.5 before:h-1.5 before:bg-accent-cyan before:rounded-full before:z-100"
          offset={-300}
          rootEl="#scroll-container"
        >
          <li className="py-2 list-none">
            <a href="#basic-settings" onClick={e => handleSmoothScroll(e, 'basic-settings')}>
              {t('AccountProfile.navigation.basicSettings')}
            </a>
          </li>
          <li className="py-2 list-none">
            <a href="#address" onClick={e => handleSmoothScroll(e, 'address')}>
              Company Info
            </a>
          </li>
          {!hidePasswordLink && (
            <li className=" py-2 list-none">
              <a href="#password" onClick={e => handleSmoothScroll(e, 'password')}>
                {t('AccountProfile.navigation.password')}
              </a>
            </li>
          )}
          <li className=" py-2 list-none">
            <a href="#delete-account" onClick={e => handleSmoothScroll(e, 'delete-account')}>
              {t('AccountProfile.navigation.deleteAccount')}
            </a>
          </li>
        </Scrollspy>
      </div>
    </div>
  );
};

interface BasicFormValues {
  first_name: string;
  last_name: string;
  number: string;
  email: string;
  profile_image: string | File;
}

interface PasswordFormValues {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
}

export default function BasicCard({
  passedUserId = null,
  companyId,
}: {
  passedUserId?: any;
  companyId?: any;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, token, uploadedImage, setUploadedImage, updateUser } = useUser();

  // This page is also rendered for OTHER users (EditUser / EditCompany pass `passedUserId`). Only the
  // logged-in user's own picture may touch the global header avatar.
  const isOwnProfile = passedUserId == null || String(passedUserId) === String(user?.id);
  // What this page displays: the saved image, or an unsaved crop preview (blob:). Kept local so an
  // unsaved preview never leaks into the header.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(isOwnProfile ? uploadedImage : null);

  const { openModal, closeModal } = useModal();
  const [cropFile, setCropFile] = useState<any>(null);
  const [companyData, setCompanyData] = useState<any>(null);
  const [companyID, setCompanyID] = useState<any>(null);

  const hideSocialPassword = isSocialLoginUser(user);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    };
  }, []);

  const basicForm = useForm<BasicFormValues>({
    resolver: yupResolver(BasicFormSchema) as any,
    defaultValues: {
      first_name: '',
      last_name: '',
      number: DEFAULT_DIAL_CODE,
      email: '',
      profile_image: '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: yupResolver(PasswordFormSchema) as any,
    defaultValues: {
      current_password: '',
      new_password: '',
      new_password_confirmation: '',
    },
  });

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const actualUserId = passedUserId ?? user?.id;
    if (!actualUserId) return;

    let cancelled = false;

    const fetchProfileData = async () => {
      try {
        const response = await get(`/api/profile?user_id=${actualUserId}`);
        if (cancelled) return;

        if (response?.data?.user) {
          const userData = response.data.user;

          setCompanyID(userData.company?.id ?? null);

          basicForm.reset({
            first_name: userData.first_name || '',
            last_name: userData.last_name || '',
            number: userData.number
              ? toInternationalPhoneValue(userData.number)
              : DEFAULT_DIAL_CODE,
            email: userData.email || '',
            profile_image: userData.profile_image || '',
          });

          if (userData.company) {
            setCompanyData(userData.company);
          }

          const savedUrl = resolveImageUrl(userData.profile_image);
          setAvatarUrl(savedUrl);
          if (isOwnProfile) setUploadedImage(savedUrl);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      }
    };

    fetchProfileData();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passedUserId, user?.id, token]);

  useEffect(() => {
    return () => {
      if (avatarUrl && avatarUrl.startsWith('blob:')) {
        URL.revokeObjectURL(avatarUrl);
      }
    };
  }, [avatarUrl]);

  function isPlaceholderPhoneValue(value: any, dialCode: string = DEFAULT_DIAL_CODE) {
    if (!value) return true;
    const digits = String(value).replace(/\D/g, '');
    return digits === dialCode;
  }

  const handleProfileSubmit = async (data: BasicFormValues) => {
    if (isPlaceholderPhoneValue(data.number, phoneDialCode)) {
      basicForm.setError('number', {
        type: 'manual',
        message: t('AccountProfile.profile.numberRequired', 'Phone number is required'),
      });
      return;
    }

    const formData = new FormData();

    formData.append('first_name', data.first_name);
    formData.append('last_name', data.last_name);
    formData.append('number', data.number);
    formData.append('email', data.email);

    if (data.profile_image instanceof File) {
      formData.append('profile_image', data.profile_image);
    }

    try {
      const response = await post(`/api/profile/${user?.id}/update`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.error) {
        console.log('Profile updated:', response);

        // NOTE: the update endpoint returns a LEAN user (names/email/number only) — it does NOT include
        // `profile_image`. So when a new picture was uploaded, read the real URL back from GET /profile.
        // Otherwise keep the avatar that is currently on screen (never the possibly-stale login-time value).
        const saved = response.user;
        const uploadedNewImage = data.profile_image instanceof File;
        let savedImage: string | null | undefined = uploadedImage;
        if (uploadedNewImage) {
          const fresh = await get(`/api/profile?user_id=${user?.id}`);
          savedImage =
            fresh?.data?.user_image ?? fresh?.data?.user?.profile_image ?? saved?.profile_image;
          if (savedImage) {
            // show the saved URL (not the blob preview); the form no longer holds a File to re-upload
            setAvatarUrl(resolveImageUrl(savedImage));
            basicForm.setValue('profile_image', savedImage);
          }
        }

        // Push the saved profile through the context (state + localStorage + global avatar) so the
        // header and the avatar popper update immediately, without a refresh.
        if (isOwnProfile && user) {
          updateUser({
            ...user,
            first_name: saved?.first_name ?? data.first_name,
            last_name: saved?.last_name ?? data.last_name,
            number: saved?.number ?? data.number,
            profile_image: savedImage ?? user.profile_image,
          } as User);
        }
      } else {
        console.error('Update failed:', response.message);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  const handleChangePassword = async (data: PasswordFormValues) => {
    try {
      const response = await post('api/change-password', data);
      if (!response.error) {
        console.log('Password changed successfully:', response);
        passwordForm.reset();
      } else {
        console.error('Change password failed:', response.message);
      }
    } catch (error) {
      console.error('Error while changing password:', error);
    }
  };

  const [confirmDeleteChecked, setConfirmDeleteChecked] = useState(false);

  const [phoneDialCode, setPhoneDialCode] = useState(DEFAULT_DIAL_CODE);

  // Delete account now confirms via matching the user's own email instead of password
  const handleDeleteAccount = async () => {
    if (!confirmDeleteChecked) {
      console.log('Please confirm before deleting your account.');
      return;
    }

    try {
      const response = await del('/api/account/delete');

      if (!response.error) {
        console.log('Account deleted');
        navigate('/login', { replace: true });
      } else {
        console.error('Delete failed:', response.message);
      }
    } catch (error) {
      console.error('Error deleting account:', error);
    }
  };

  const handleOpenDeleteModal = () => {
    const EmailConfirmInput = () => {
      const [emailInput, setEmailInput] = useState('');
      const [touched, setTouched] = useState(false);

      const accountEmail = (user?.email || '').trim().toLowerCase();
      const isMatch = emailInput.trim().toLowerCase() === accountEmail;

      return (
        <div className="p-4 space-y-4">
          <h2 className="text-lg font-medium">Are you sure you want to delete your account?</h2>
          <div>
            <label className="block text-xs font-medium text-ink-1 mb-1">
              Type your account email to confirm ({user?.email}):
            </label>
            <InputField
              height="h-8"
              type="email"
              value={emailInput}
              onChange={e => {
                setEmailInput(e.target.value);
                if (!touched) setTouched(true);
              }}
              placeholder="Enter your email"
            />
            {touched && !isMatch && (
              <p className="text-danger-text text-xs mt-1">
                Email does not match your account email.
              </p>
            )}
          </div>
          <div className="flex justify-end space-x-5">
            <div>
              <Button
                sx={{
                  px: '14px',
                  py: '5px',
                  border: '1px solid #D1D5DB',
                  backgroundColor: '#F9FAFB',
                  color: '#374151',
                  fontSize: '0.875rem',
                  borderRadius: '4px',
                  '&:hover': {
                    backgroundColor: '#F9FAFB',
                  },
                  '&:focus': {
                    outline: 'none',
                  },
                }}
                className="min-w-[100px] px-6 hover:scale-105 py-2"
                variant="outlined"
                onClick={closeModal}
              >
                Cancel
              </Button>
            </div>
            <div>
              <Button
                className="bg-danger text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isMatch}
                onClick={() => {
                  if (!isMatch) {
                    setTouched(true);
                    return;
                  }
                  closeModal();
                  handleDeleteAccount();
                }}
                sx={{ backgroundColor: '#ff0000' }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      );
    };

    openModal(<EmailConfirmInput />);
  };

  return (
    <>
      <div className="flex h-screen  overflow-hidden  pl-0 2xl:pl-25">
        <div className="w-0  lg:w-60 xl:w-85 shrink-0">
          <div className="mx-0 lg:mx-2 xl:mx-8">
            <ScrollSidebar hidePasswordLink={hideSocialPassword} />
          </div>
        </div>
        <div
          id="scroll-container"
          className="flex-1 px-4 overflow-y-auto scroll-hidden scroll-smooth xl:-ml-20 xl:mr-30"
        >
          <div
            id="basic-settings"
            className="flex justify-center mt-10 p-5 lg:p-0 border border-line-soft rounded-md"
          >
            <Card
              sx={{
                width: '100%',
                borderRadius: 2.5,
                boxShadow: 'none',
                overflow: 'visible',
                backgroundColor: 'var(--color-surface-1)',
                color: 'var(--color-ink-2)',
              }}
            >
              <CardContent>
                <h5 className="  font-semibold">{t('AccountProfile.navigation.basicSettings')}</h5>
                <div className="w-full border-b border-line mt-4.5" />
                <form onSubmit={basicForm.handleSubmit(handleProfileSubmit)}>
                  <div className="flex  justify-between mt-8">
                    <h1 className="font-medium text-sm">{t('AccountProfile.profile.profile')}</h1>
                    <p className="text-[10px] sm:text-xs text-ink-2 hidden sm:block">
                      {t('AccountProfile.profile.imageHint')}
                    </p>
                    <Controller
                      control={basicForm.control}
                      name="profile_image"
                      render={({ field }) => (
                        <>
                          <CustomAvatar
                            alt="User Avatar"
                            name={basicForm.watch('first_name')}
                            src={avatarUrl || ''}
                            canUpload={true}
                            size={55}
                            className="-mt-4"
                            onImageChange={(file: any) => {
                              if (file instanceof File) {
                                setCropFile(file);
                              }
                            }}
                          />

                          {cropFile && (
                            <ImageCropModal
                              file={cropFile}
                              onCancel={() => setCropFile(null)}
                              onComplete={({ file, previewUrl }: any) => {
                                setAvatarUrl(previewUrl);
                                field.onChange(file);
                                setCropFile(null);
                              }}
                            />
                          )}
                        </>
                      )}
                    />
                  </div>
                  {basicForm.formState.errors.profile_image && (
                    <p className="text-danger-text text-xs mt-1 text-center -ml-2">
                      {basicForm.formState.errors.profile_image.message}
                    </p>
                  )}

                  <div className="flex max-md:flex-col max-md:gap-1  justify-between mt-8">
                    <h1 className="font-medium text-sm">{t('AccountProfile.profile.firstName')}</h1>

                    <Controller
                      control={basicForm.control}
                      name="first_name"
                      render={({ field }) => (
                        <InputField
                          {...field}
                          error={!!basicForm.formState.errors.first_name}
                          helperText={basicForm.formState.errors.first_name?.message}
                          className="w-full rounded-sm text-lg p-2 focus:outline-none"
                          width="w-[70%] max-md:w-[100%]"
                          height="h-[36px]"
                        />
                      )}
                    />
                  </div>

                  <div className="flex max-md:flex-col  max-md:gap-1 justify-between mt-8">
                    <h1 className="font-medium text-sm"> {t('AccountProfile.profile.lastName')}</h1>

                    <Controller
                      control={basicForm.control}
                      name="last_name"
                      render={({ field }) => (
                        <InputField
                          {...field}
                          error={!!basicForm.formState.errors.last_name}
                          helperText={basicForm.formState.errors.last_name?.message}
                          className="w-full rounded-sm text-lg p-2 focus:outline-none"
                          width="w-[70%] max-md:w-[100%]"
                          height="h-[36px]"
                        />
                      )}
                    />
                  </div>

                  <div className="flex  max-md:flex-col max-md:gap-1 justify-between mt-8 items-start">
                    <h1 className="font-medium text-sm mt-2">
                      {t('AccountProfile.profile.phone')}
                    </h1>

                    <Controller
                      control={basicForm.control}
                      name="number"
                      render={({ field }) => (
                        <div className="w-full md:w-[70%]">
                          <PhoneInput
                            country={'pk'}
                            enableSearch={true}
                            countryCodeEditable={false}
                            value={field.value ? field.value.replace(/\D/g, '') : DEFAULT_DIAL_CODE}
                            onChange={(value: string, country: any) => {
                              field.onChange(`+${value}`);
                              setPhoneDialCode(country?.dialCode || DEFAULT_DIAL_CODE);
                              if (basicForm.formState.errors.number) {
                                basicForm.clearErrors('number');
                              }
                            }}
                            containerStyle={{ width: '100%' }}
                            specialLabel=""
                          />
                          {basicForm.formState.errors.number && (
                            <p className="text-danger-text text-xs mt-1">
                              {basicForm.formState.errors.number.message}
                            </p>
                          )}
                        </div>
                      )}
                    />
                  </div>

                  <div className="flex max-md:flex-col max-md:gap-1 justify-between mt-8">
                    <h1 className="font-medium text-sm">{t('AccountProfile.profile.email')}</h1>

                    <Controller
                      control={basicForm.control}
                      name="email"
                      render={({ field }) => (
                        <InputField
                          {...field}
                          error={!!basicForm.formState.errors.email}
                          helperText={basicForm.formState.errors.email?.message}
                          className="w-full rounded-sm text-lg p-2 focus:outline-none"
                          width="w-[70%] max-md:w-[100%]"
                          height="h-[36px]"
                        />
                      )}
                    />
                  </div>

                  <div className="mt-6 float-right mb-5">
                    <Button type="submit" size="small">
                      {t('AccountProfile.buttons.saveChanges')}
                    </Button>
                  </div>
                </form>
              </CardContent>
              <CardActions></CardActions>
            </Card>
          </div>

          <div
            id="address"
            className="flex justify-center mt-10 p-5 lg:p-0 border border-line-soft  rounded-md"
          >
            <Card
              sx={{
                width: '100%',
                borderRadius: 2.5,
                boxShadow: 'none',
                backgroundColor: 'var(--color-surface-1)',
                color: 'var(--color-ink-2)',
              }}
            >
              <CardContent>
                <AddLocation companyData={companyData} companyID={companyID} />
              </CardContent>
              <CardActions></CardActions>
            </Card>
          </div>

          {!hideSocialPassword && (
            <div
              id="password"
              className="flex justify-center mt-10 p-5 lg:p-0 border border-line-soft  rounded-md"
            >
              <Card
                sx={{
                  width: '100%',
                  borderRadius: 2.5,
                  boxShadow: 'none',
                  backgroundColor: 'var(--color-surface-1)',
                  color: 'var(--color-ink-2)',
                }}
              >
                <CardContent>
                  <h5 className="font-semibold">{t('AccountProfile.navigation.password')}</h5>
                  <div className="w-full border-b border-line mt-4.5" />
                  <form onSubmit={passwordForm.handleSubmit(handleChangePassword)}>
                    <div className="flex max-md:flex-col  max-md:gap-1 justify-between mt-8">
                      <h1 className="font-medium text-sm">
                        {t('AccountProfile.passwordForm.current')}
                      </h1>

                      <div className="relative w-[70%] max-md:w-[100%]">
                        <Controller
                          control={passwordForm.control}
                          name="current_password"
                          render={({ field }) => (
                            <InputField
                              {...field}
                              error={!!passwordForm.formState.errors.current_password}
                              helperText={passwordForm.formState.errors.current_password?.message}
                              type={showCurrentPassword ? 'text' : 'password'}
                              className="w-full rounded-sm text-lg p-2 focus:outline-none"
                              width="w-full"
                              height="h-[36px]"
                            />
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          aria-label={
                            showCurrentPassword ? 'Hide current password' : 'Show current password'
                          }
                          aria-pressed={showCurrentPassword}
                          className="absolute right-3 cursor-pointer top-0 flex items-center h-9"
                        >
                          {showCurrentPassword ? (
                            <EyeOff className="h-4 w-4 text-ink-2" />
                          ) : (
                            <Eye className="h-4 w-4 text-ink-2" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex max-md:flex-col max-md:gap-1 justify-between mt-8">
                      <h1 className="font-medium text-sm">
                        {t('AccountProfile.passwordForm.new')}
                      </h1>

                      <div className="relative w-[70%] max-md:w-[100%]">
                        <Controller
                          control={passwordForm.control}
                          name="new_password"
                          render={({ field }) => (
                            <InputField
                              {...field}
                              error={!!passwordForm.formState.errors.new_password}
                              helperText={passwordForm.formState.errors.new_password?.message}
                              type={showNewPassword ? 'text' : 'password'}
                              className="w-full rounded-sm text-lg p-2 focus:outline-none"
                              width="w-full"
                              height="h-[36px]"
                            />
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                          aria-pressed={showNewPassword}
                          className="absolute right-3 cursor-pointer top-0 flex items-center h-9"
                        >
                          {showNewPassword ? (
                            <EyeOff className="h-4 w-4 text-ink-2" />
                          ) : (
                            <Eye className="h-4 w-4 text-ink-2" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex max-md:flex-col max-md:gap-1 justify-between mt-8">
                      <h1 className="font-medium text-sm">
                        {t('AccountProfile.passwordForm.confirm')}
                      </h1>

                      <div className="relative w-[70%] max-md:w-[100%]">
                        <Controller
                          control={passwordForm.control}
                          name="new_password_confirmation"
                          render={({ field }) => (
                            <InputField
                              {...field}
                              error={!!passwordForm.formState.errors.new_password_confirmation}
                              helperText={
                                passwordForm.formState.errors.new_password_confirmation?.message
                              }
                              type={showConfirmPassword ? 'text' : 'password'}
                              className="w-full rounded-sm text-lg p-2 focus:outline-none"
                              width="w-full"
                              height="h-[36px]"
                            />
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          aria-label={
                            showConfirmPassword
                              ? 'Hide password confirmation'
                              : 'Show password confirmation'
                          }
                          aria-pressed={showConfirmPassword}
                          className="absolute right-3 cursor-pointer top-0 flex items-center h-9"
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4 text-ink-2" />
                          ) : (
                            <Eye className="h-4 w-4 text-ink-2" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="mt-6 float-right mb-5">
                      <Button type="submit" size="small">
                        {t('AccountProfile.passwordForm.reset')}
                      </Button>
                    </div>
                  </form>
                </CardContent>
                <CardActions></CardActions>
              </Card>
            </div>
          )}

          <div
            id="delete-account"
            className="flex justify-center mt-10 mb-52 p-5  lg:p-0 border border-line-soft   rounded-md"
          >
            <Card
              sx={{
                width: '100%',
                borderRadius: 2.5,
                boxShadow: 'none',
                backgroundColor: 'var(--color-surface-1)',
                color: 'var(--color-ink-2)',
              }}
            >
              <CardContent>
                <h5 className="font-semibold  ">{t('AccountProfile.delete.title')}</h5>
                <div className="w-full border-b border-line mt-4.5" />
                <p className="text-xs sm:text-sm mt-8">
                  {t('AccountProfile.delete.text')}{' '}
                  <a className="text-brand-text text-xs" href="/">
                    {t('AccountProfile.delete.guideline')}
                  </a>{' '}
                  if you still wish continue.
                </p>
                <div className="flex items-center text-xs sm:text-sm font-medium mt-4">
                  <Checkbox.Root
                    checked={confirmDeleteChecked}
                    onCheckedChange={checked => setConfirmDeleteChecked(!!checked)}
                    className="flex h-5 w-5 items-center justify-center rounded border border-line bg-surface-2 data-[state=checked]:bg-accent-cyan data-[state=checked]:border-accent-cyan focus:outline-none  cursor-pointer"
                    id="delete-confirm"
                  >
                    <Checkbox.Indicator className="text-[#04121a]">
                      <CheckIcon className="h-4 w-4" />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  <label htmlFor="delete-confirm" className="ml-2 cursor-pointer select-none">
                    {t('AccountProfile.delete.confirm')}
                  </label>
                </div>

                <div className="mt-6 float-right mb-5">
                  <Button
                    size="small"
                    onClick={handleOpenDeleteModal}
                    disabled={!confirmDeleteChecked}
                    sx={{
                      backgroundColor: '#FF0000',
                      color: '#ffffff',
                      padding: '8px',
                    }}
                  >
                    {t('AccountProfile.buttons.deleteAccount')}
                  </Button>
                </div>
              </CardContent>
              <CardActions></CardActions>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
