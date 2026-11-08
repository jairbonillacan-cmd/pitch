import React from 'react'

import './Profile.scss'
import '../components/App.scss'
import GlobalContext from '../components/GlobalContext'
import Button from '../components/Button'
import HtmlHeaders from '../html-headers'
import InputSelection from '../components/InputSelection'
import { API_HOST } from '../react-web-constants'
import { getTheme, setTheme } from '../react-web-utils'
import { isDictSubsetEqual } from '../linemate-react-common/src/core-utils'
import {
  containsLowercase,
  containsNumber,
  containsUppercase,
  hasPremiumAccess,
  isAlphaNumeric,
  isPaidUser,
  isSuperUser,
  updateUserAttributes
} from '../linemate-react-common/src/util'
import _ from 'lodash'
import Dialog from '../components/Dialog'
import { auth } from '../firebase.js'
import Checkbox from '../components/Checkbox'
import { SPORTSBOOKS_CONFIG } from '../linemate-react-common/src/constants.js'
import Footer from '../components/Footer.jsx'
import i18n from '../i18n'
import { localeLabels, supportedLocales } from '../linemate-react-common/src/localization/locales'
import { withTranslation } from 'react-i18next'

class Profile extends React.Component {
  static contextType = GlobalContext

  constructor(props, context) {
    // https://github.com/facebook/react/issues/13944
    // Looks like this API is being deprecated but it doesn't look like there is any official way of doing it in the new API
    super(props, context)

    if (!context.user) {
      window.location.href = `/${context.configuration.defaultLeague}`
    }

    this.billingLinkClicked = this.billingLinkClicked.bind(this)
    this.mobileSubscriptionLinkClicked = this.mobileSubscriptionLinkClicked.bind(this)
    this.updateInfo = this.updateInfo.bind(this)
    this.changePassword = this.changePassword.bind(this)
    this.updatePreferences = this.updatePreferences.bind(this)
    this.deleteAccount = this.deleteAccount.bind(this)

    this.changePasswordOldPasswordRef = React.createRef()
    this.changePasswordNewPasswordRef = React.createRef()
    this.changePasswordConfirmNewPasswordRef = React.createRef()
    this.deleteAccountPasswordRef = React.createRef()

    this.preferredOddsFormatOptions = {
      american: 'American',
      decimal: 'Decimal'
    }

    this.themeOptions = {
      // system: 'Match System',
      light: 'Light',
      dark: 'Dark'
    }

    const preferredProviders = new Set(context.userAttributes?.preferredProviders || [])

    this.state = {
      changePasswordDialogOpen: false,
      changePreferredOddsOpen: false,
      deleteAccountDialogOpen: false,
      email: context.user.email,
      initialUserAttributes: {
        firstName: context.userAttributes.firstName,
        lastName: context.userAttributes.lastName,
        username: context.userAttributes.username
      },
      userAttributes: {
        firstName: context.userAttributes.firstName,
        lastName: context.userAttributes.lastName,
        username: context.userAttributes.username
      },
      usernameValidation: null,
      changePassword: {
        oldPasswordFilled: false,
        newPasswordFilled: false,
        confirmNewPasswordFilled: false
      },
      changePasswordValidation: {
        oldPassword: null,
        newPassword: null,
        confirmNewPassword: null
      },
      // Checking both for backwards compatibility
      //  TODO: remove this eventually
      initialPreferences: {
        preferredOddsFormat:
          context.userAttributes.preferredOddsFormat || context.userAttributes.preferredLineFormat,
        theme: getTheme(),
        language: supportedLocales.includes(i18n.resolvedLanguage)
          ? i18n.resolvedLanguage
          : supportedLocales.includes(i18n.language)
            ? i18n.language
            : 'en'
      },
      preferences: {
        preferredOddsFormat:
          context.userAttributes.preferredOddsFormat || context.userAttributes.preferredLineFormat,
        theme: getTheme(),
        language: supportedLocales.includes(i18n.resolvedLanguage)
          ? i18n.resolvedLanguage
          : supportedLocales.includes(i18n.language)
            ? i18n.language
            : 'en'
      },
      deleteAccount: {
        acknowledgmentChecked: false,
        passwordFilled: false,
        error: null
      },
      preferredProviders: preferredProviders,
      allProvidersSelected: preferredProviders.size === 0
    }
  }

  componentDidMount() {
    document.title = `${this.props.t('userProfile.header.title')} - Linemate`
    auth.onAuthStateChanged((user) => {
      if (!user) {
        window.location.href = `/${this.context.configuration.defaultLeague}`
      }
    })
  }

  billingLinkClicked() {
    this.context.user.getIdToken().then((token) => {
      const requestInfo = {
        headers: { Authorization: 'Bearer ' + token }
      }
      fetch(`${API_HOST}/api/payment/v1/portal`, requestInfo)
        .then((data) => data.json())
        .then((result) => {
          if (result.code && result.code > 200) {
            console.log('Error fetching stripe url')
          } else {
            window.open(result.redirect, '_blank').focus()
          }
        })
        .catch((error) => {
          console.log('Error fetching stripe url', error)
        })
    })
  }

  mobileSubscriptionLinkClicked() {
    window.location.href = '/manage-subscription'
  }

  updateInfo() {
    const username = this.state.userAttributes.username
    if (username.length < 6 || !isAlphaNumeric(username)) {
      this.setState({
        usernameValidation: this.props.t('preferences.profile.alerts.usernameInvalid')
      })
      return
    }

    fetch(`${API_HOST}/api/users/v1/checkUsernameAvailability?username=${username}`)
      .then((data) => data.json())
      .then((response) => {
        if (response.available) {
          this.context.user.getIdToken().then((token) => {
            updateUserAttributes(API_HOST, token, this.state.userAttributes).then(() => {
              this.setState({
                initialUserAttributes: _.cloneDeep(this.state.userAttributes),
                usernameValidation: null
              })
            })
          })
        } else {
          this.setState({ usernameValidation: this.props.t('preferences.profile.alerts.usernameTaken') })
        }
      })
  }

  changePassword() {
    const newPassword = this.changePasswordNewPasswordRef.current.value
    if (
      newPassword.length < 8 ||
      !containsNumber(newPassword) ||
      !containsUppercase(newPassword) ||
      !containsLowercase(newPassword)
    ) {
      this.setState({
        changePasswordValidation: {
          newPassword: this.props.t('userProfile.validation.passwordRequirements')
        }
      })
      return
    }
    const confirmNewPassword = this.changePasswordConfirmNewPasswordRef.current.value
    if (newPassword !== confirmNewPassword) {
      this.setState({
        changePasswordValidation: { confirmNewPassword: this.props.t('userProfile.validation.confirmPasswordMismatch') }
      })
      return
    }

    auth
      .signInWithEmailAndPassword(this.state.email, this.changePasswordOldPasswordRef.current.value)
      .then((credentials) => {
        auth
          .updatePassword(credentials.user, this.changePasswordNewPasswordRef.current.value)
          .then(() => {
            this.setState({
              changePasswordDialogOpen: false,
              changePassword: {
                oldPasswordFilled: false,
                newPasswordFilled: false,
                confirmNewPasswordFilled: false
              }
            })
          })
          .catch((error) => {
            console.log(error)
            // Re-using the confirm password space as a generic error spot at the bottom
            this.setState({
              changePasswordValidation: {
                confirmNewPassword: this.props.t('common.errors.genericTryAgainLater')
              }
            })
          })
      })
      .catch((error) => {
        var errorCode = error.code
        console.log(errorCode)
        switch (errorCode) {
          case 'auth/wrong-password':
            this.setState({ changePasswordValidation: { oldPassword: this.props.t('userProfile.validation.incorrectPassword') } })
            break
          default:
            // Re-using the confirm password space as a generic error spot at the bottom
            this.setState({
              changePasswordValidation: {
                confirmNewPassword: this.props.t('common.errors.genericTryAgainLater')
              }
            })
            break
        }
      })
  }

  updatePreferences() {
    if (
      this.state.preferences.preferredOddsFormat !==
      this.state.initialPreferences.preferredOddsFormat
    ) {
      this.context.user.getIdToken().then((token) => {
        updateUserAttributes(API_HOST, token, {
          preferredOddsFormat: this.state.preferences.preferredOddsFormat,
          preferredLineFormat: this.state.preferences.preferredOddsFormat
        }).then(() => {
          this.setState((previousState) => {
            return {
              initialPreferences: {
                ...previousState.initialPreferences,
                preferredOddsFormat: this.state.preferences.preferredOddsFormat
              }
            }
          })
        })
      })
    }

    if (this.state.preferences.theme !== this.state.initialPreferences.theme) {
      setTheme(this.state.preferences.theme)
      this.setState((previousState) => {
        return {
          initialPreferences: {
            ...previousState.initialPreferences,
            theme: this.state.preferences.theme
          }
        }
      })
    }

    if (this.state.preferences.language !== this.state.initialPreferences.language) {
      window.localStorage.setItem('language', this.state.preferences.language)
      i18n.changeLanguage(this.state.preferences.language).then(() => {
        window.dispatchEvent(new Event('linemate-language-changed'));
      })
      this.setState((previousState) => {
        return {
          initialPreferences: {
            ...previousState.initialPreferences,
            language: this.state.preferences.language
          }
        }
      })
    }
  }

  deleteAccount() {
    auth
      .signInWithEmailAndPassword(this.state.email, this.deleteAccountPasswordRef.current.value)
      .then((credentials) => {
        credentials.user.getIdToken().then((token) => {
          fetch(`${API_HOST}/api/users/v1/delete`, {
            headers: { Authorization: 'Bearer ' + token },
            method: 'DELETE'
          })
            .then((response) => {
              if (response.status == 200) {
                this.setState({ deleteAccountDialogOpen: false }, () => auth.signOut())
              } else {
                this.setState({
                  deleteAccount: {
                    ...this.state.deleteAccount,
                    error: this.props.t('common.errors.genericTryAgainLater')
                  }
                })
              }
            })
            .catch((err) => {
              console.log(err)
              this.setState({
                deleteAccount: {
                  ...this.state.deleteAccount,
                  error: this.props.t('common.errors.genericTryAgainLater')
                }
              })
            })
        })
      })
      .catch((error) => {
        console.log(error)
        var errorCode = error.code
        switch (errorCode) {
          case 'auth/wrong-password':
            this.setState({
              deleteAccount: { ...this.state.deleteAccount, error: this.props.t('userProfile.validation.incorrectPassword') }
            })
            break
          default:
            this.setState({
              deleteAccount: {
                ...this.state.deleteAccount,
                error: this.props.t('common.errors.genericTryAgainLater')
              }
            })
            break
        }
      })
  }

  render() {
    const { t } = this.props
    const preferredOddsFormatOptions = {
      american: t('preferences.display.options.odds.american'),
      decimal: t('preferences.display.options.odds.decimal')
    }
    const themeOptions = {
      light: t('preferences.display.options.theme.Light'),
      dark: t('preferences.display.options.theme.Dark')
    }
    const profileInfoChanged = !isDictSubsetEqual(
      ['firstName', 'lastName', 'username'],
      this.state.userAttributes,
      this.state.initialUserAttributes
    )
    const profileInfoFilled =
      this.state.userAttributes.firstName &&
      this.state.userAttributes.lastName &&
      this.state.userAttributes.username
    const preferencesChanged = !isDictSubsetEqual(
      ['preferredOddsFormat', 'theme', 'language'],
      this.state.preferences,
      this.state.initialPreferences
    )
    return (
      <>
        <HtmlHeaders canonicalRef="https://www.linemate.io/profile" />
        <div className="profile-page-container">
          <div className="profile-page-content">
            <div className="profile-page-header">
              <p className="text-style-h-2-semibold color-fig-default">{t('userProfile.header.title')}</p>
              <p className="text-style-label-normal color-fig-subtle">
                {t('userProfile.header.subtitle')}
              </p>
            </div>
            {/* Profile info */}
            <div className="profile-page-info">
              <p className="text-style-h-4-medium color-fig-default">{t('userProfile.sections.accountDetails')}</p>
              {/* TODO: we also have the email in the user attributes. TBD which should be the source of truth. Probably the firebase one since its their login */}
              {/* We also should make sure both get updated */}
              {/* TODO: there's also the Stripe email */}
              {/* 
                                For now going to keep email out, updating it requires to re-enter password. 
                                If there's time we'll add it the same as change password but TBD on the UX, 
                                need to talk to Johnson since it's a different flow if it belongs under the rest of the regular profile items
                                This will have to be done by requesting password, then triggering a new sign-in
                                auth
                                .signInWithEmailAndPassword(email, password)
                                .then((userCredential) => {
                                    userCredential.user.updateEmail(newEmail)
                                }) 
                                In theory you can do it without re-logging in but if it's been too long it won't work so might as well always ask
                            */}
              {/* <div className='profile-page-info-row'>
                                <p className='text-style-label-medium color-fig-default'>Email</p>
                                <input value={this.state.email} className='text-style-body-normal' onInput={(e) => this.setState({email: e.target.value})} type="email"/>
                            </div> */}
              <div className="profile-page-info-row">
                <p className="text-style-label-medium color-fig-default">{t('common.labels.firstName')}</p>
                <input
                  value={this.state.userAttributes.firstName}
                  className="text-style-body-normal"
                  onInput={(e) =>
                    this.setState({
                      userAttributes: { ...this.state.userAttributes, firstName: e.target.value }
                    })
                  }
                  type="text"
                />
              </div>
              <div className="profile-page-info-row">
                <p className="text-style-label-medium color-fig-default">{t('common.labels.lastName')}</p>
                <input
                  value={this.state.userAttributes.lastName}
                  className="text-style-body-normal"
                  onInput={(e) =>
                    this.setState({
                      userAttributes: { ...this.state.userAttributes, lastName: e.target.value }
                    })
                  }
                  type="text"
                />
              </div>
              <div className="profile-page-info-row">
                <p className="text-style-label-medium color-fig-default">{t('common.labels.username')}</p>
                <input
                  value={this.state.userAttributes.username}
                  className="text-style-body-normal"
                  onInput={(e) =>
                    this.setState({
                      userAttributes: { ...this.state.userAttributes, username: e.target.value }
                    })
                  }
                  type="text"
                />
              </div>
              {/* A bit hacky to put it here but can't be bothered to add styling for it */}
              {this.state.usernameValidation && (
                <p
                  className="text-style-caption-normal color-fig-negative"
                  style={{ textAlign: 'end' }}>
                  {this.state.usernameValidation}
                </p>
              )}
              <div className="profie-page-info-button">
                <Button
                  text={t('userProfile.actions.update')}
                  typography="md"
                  type="primary"
                  enabled={profileInfoChanged && profileInfoFilled}
                  onClick={this.updateInfo}
                />
              </div>
            </div>
            {/* Password */}
            <div className="profile-page-password">
              <p className="text-style-h-4-medium color-fig-default">{t('common.labels.password')}</p>
              <div className="profile-page-password-row">
                <p className="text-style-label-medium color-fig-default">
                  {t('userProfile.descriptions.changePassword')}
                </p>
                <div className="profile-page-password-row-button">
                  <Dialog
                    open={this.state.changePasswordDialogOpen}
                    onOpenChange={(open) =>
                      this.setState({
                        changePasswordDialogOpen: open,
                        changePassword: {
                          oldPasswordFilled: false,
                          newPasswordFilled: false,
                          confirmNewPasswordFilled: false
                        }
                      })
                    }
                    trigger={
                      <Button
                        text={t('common.actions.changePassword')}
                        typography="md"
                        type="secondary"
                        enabled={true}
                        onClick={() => this.setState({ changePasswordDialogOpen: true })}
                      />
                    }
                    title={t('common.actions.changePassword')}
                    content={
                      <div className="profile-page-change-password-dialog-content">
                        <div className="profile-page-change-password-dialog-content-row">
                          <p className="text-style-label-medium color-fig-default">{t('userProfile.labels.oldPassword')}</p>
                          <input
                            ref={this.changePasswordOldPasswordRef}
                            type="password"
                            onInput={(e) =>
                              this.setState({
                                changePassword: {
                                  ...this.state.changePassword,
                                  oldPasswordFilled: e.target.value && e.target.value.trim() !== ''
                                }
                              })
                            }
                          />
                          {this.state.changePasswordValidation.oldPassword && (
                            <p className="text-style-caption-normal color-fig-negative">
                              {this.state.changePasswordValidation.oldPassword}
                            </p>
                          )}
                        </div>
                        <div className="profile-page-change-password-dialog-content-row">
                          <p className="text-style-label-medium color-fig-default">{t('userProfile.labels.newPassword')}</p>
                          <input
                            ref={this.changePasswordNewPasswordRef}
                            type="password"
                            onInput={(e) =>
                              this.setState({
                                changePassword: {
                                  ...this.state.changePassword,
                                  newPasswordFilled: e.target.value && e.target.value.trim() !== ''
                                }
                              })
                            }
                          />
                          {this.state.changePasswordValidation.newPassword && (
                            <p className="text-style-caption-normal color-fig-negative">
                              {this.state.changePasswordValidation.newPassword}
                            </p>
                          )}
                        </div>
                        <div className="profile-page-change-password-dialog-content-row">
                          <p className="text-style-label-medium color-fig-default">
                            {t('userProfile.labels.confirmNewPassword')}
                          </p>
                          <input
                            ref={this.changePasswordConfirmNewPasswordRef}
                            type="password"
                            onInput={(e) =>
                              this.setState({
                                changePassword: {
                                  ...this.state.changePassword,
                                  confirmNewPasswordFilled:
                                    e.target.value && e.target.value.trim() !== ''
                                }
                              })
                            }
                          />
                          {this.state.changePasswordValidation.confirmNewPassword && (
                            <p className="text-style-caption-normal color-fig-negative">
                              {this.state.changePasswordValidation.confirmNewPassword}
                            </p>
                          )}
                        </div>
                      </div>
                    }
                    footer={
                      <div className="profile-page-change-password-dialog-footer">
                        <div>
                          <Button
                            text={t('common.actions.cancel')}
                            typography="md"
                            type="secondary"
                            enabled={true}
                            onClick={() => this.setState({ changePasswordDialogOpen: false })}
                          />
                        </div>
                        <div>
                          <Button
                            text={t('common.actions.changePassword')}
                            typography="md"
                            type="primary"
                            enabled={
                              this.state.changePassword.confirmNewPasswordFilled &&
                              this.state.changePassword.newPasswordFilled &&
                              this.state.changePassword.oldPasswordFilled
                            }
                            onClick={this.changePassword}
                          />
                        </div>
                      </div>
                    }
                  />
                </div>
              </div>
            </div>
            {/* Preferred Odds */}
            <div className="profile-page-password">
              <p className="text-style-h-4-medium color-fig-default">{t('common.labels.preferredOdds')}</p>
              <div className="profile-page-password-row">
                <p className="text-style-label-medium color-fig-default">
                  {t('userProfile.descriptions.preferredOdds')}
                </p>
                <div className="profile-page-password-row-button">
                  <Dialog
                    open={this.state.changePreferredOddsOpen}
                    onOpenChange={(open) => {
                      const preferredProviders = new Set(this.context.userAttributes?.preferredProviders || [])
                      this.setState({
                        changePreferredOddsOpen: open,
                        preferredProviders: preferredProviders,
                        allProvidersSelected: preferredProviders.size === 0
                      })
                    }}
                    trigger={
                      <Button
                        text={t('userProfile.actions.choosePreferredOdds')}
                        typography="md"
                        type="secondary"
                        enabled={true}
                        onClick={() => this.setState({ changePreferredOddsOpen: true })}
                      />
                    }
                    title={t('userProfile.actions.choosePreferredOdds')}
                    content={
                      <>
                        <div className={'profile-page-preferred-odds-content'}>
                          <div className={'profile-page-preferred-odds-section'}>
                            <div className={'profile-page-preferred-odds-header'}>
                              <p>{t('preferences.display.preferences.odds')}</p>
                              <div className={'profile-page-preferred-odds-filter'}>
                                <p>{t('userProfile.labels.showAll')}</p>
                                <div 
                                  className={'profile-page-preferred-odds-toggle'} 
                                  onClick={() => {
                                    this.state.allProvidersSelected = !this.state.allProvidersSelected
                                    if (this.state.allProvidersSelected) {
                                      this.state.preferredProviders.clear()
                                    }
                                    this.forceUpdate()
                                  }}
                                >
                                  <div className={`profile-page-preferred-odds-switch ${this.state.preferredProviders.size === 0 ? 'switch-enabled' : ''}`}>
                                    <div className={'profile-page-preferred-odds-handle '} />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className={'profile-page-preferred-odds-grid'}>
                              {/* sportsbook button */}
                              {Object.keys(SPORTSBOOKS_CONFIG).filter(x => this.context.localizedCountryProviders.includes(x)).sort().map((sportsbook) => (
                                <div
                                  key={sportsbook}
                                  className={`profile-page-preferred-odds-grid-item ${this.state.preferredProviders.has(sportsbook) ? 'grid-item-selected' : ''}`}
                                  onClick={() => {
                                    if (this.state.preferredProviders.has(sportsbook)) {
                                      this.state.preferredProviders.delete(sportsbook)
                                    } else {
                                      this.state.preferredProviders.add(sportsbook)
                                      this.state.allProvidersSelected = false
                                    }
                                    this.forceUpdate()
                                  }}
                                >
                                  <img
                                    src={`/assets/sportsbooks/${sportsbook}.svg`}
                                    alt={SPORTSBOOKS_CONFIG[sportsbook].displayName}
                                  />

                                  <div className={'sportsbookName'}>{SPORTSBOOKS_CONFIG[sportsbook].displayName}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    }
                    footer={
                      <div class={'profile-page-preferred-odds-dialog-footer'}>
                        <Button
                          enabled={true}
                          typography="md"
                          type={'primary'}
                          text={t('userProfile.actions.saveMyChoices')}
                          onClick={async () => {
                            const preferredProviders = [...this.state.preferredProviders];

                            await updateUserAttributes(API_HOST, await auth.currentUser.getIdToken(), {
                              preferredProviders
                            });

                            this.context.setUserAttributes({
                              ...this.context.userAttributes,
                              preferredProviders
                            });

                            this.setState({
                              changePreferredOddsOpen: false,
                              preferredProviders: new Set(preferredProviders),
                              allProvidersSelected: preferredProviders.length === 0
                            });
                          }}
                        />
                      </div>
                    }
                  />
                </div>
              </div>
            </div>
            {/* Preferences */}
            <div className="profile-page-preferences">
              <p className="text-style-h-4-medium color-fig-default">{t('preferences.sections.display')}</p>
                <div className="profile-page-preferences-row">
                  <div className="profile-page-preferences-row-left">
                    <p className="text-style-label-medium color-fig-default">{t('preferences.display.preferences.language')}</p>
                    <p className="text-style-label-normal color-fig-subtle">
                      {t('userProfile.descriptions.language')}
                    </p>
                  </div>
                  <div className="profile-page-preferences-row-right">
                    <InputSelection
                      type="single"
                      options={localeLabels}
                      selection={this.state.preferences.language}
                      typography="md"
                      enabled={true}
                      selectionHandler={(selection) =>
                        this.setState({
                          preferences: { ...this.state.preferences, language: selection }
                        })
                      }
                    />
                  </div>
                </div>
              <div className="profile-page-preferences-row">
                <div className="profile-page-preferences-row-left">
                  <p className="text-style-label-medium color-fig-default">{t('preferences.display.preferences.odds')}</p>
                  <p className="text-style-label-normal color-fig-subtle">
                    {t('userProfile.descriptions.odds')}
                  </p>
                </div>
                <div className="profile-page-preferences-row-right">
                  <InputSelection
                    type="single"
                    options={preferredOddsFormatOptions}
                    selection={this.state.preferences.preferredOddsFormat}
                    typography="md"
                    enabled={true}
                    selectionHandler={(selection) =>
                      this.setState({
                        preferences: { ...this.state.preferences, preferredOddsFormat: selection }
                      })
                    }
                  />
                </div>
              </div>
              <div className="profile-page-preferences-row">
                <div className="profile-page-preferences-row-left">
                  <p className="text-style-label-medium color-fig-default">{t('preferences.display.preferences.theme')}</p>
                  <p className="text-style-label-normal color-fig-subtle">
                    {t('userProfile.descriptions.theme')}
                  </p>
                </div>
                <div className="profile-page-preferences-row-right">
                  <InputSelection
                    type="single"
                    options={themeOptions}
                    selection={this.state.preferences.theme}
                    typography="md"
                    enabled={true}
                    selectionHandler={(selection) =>
                      this.setState({
                        preferences: { ...this.state.preferences, theme: selection }
                      })
                    }
                  />
                </div>
              </div>
              <div className="profile-page-preferences-button">
                <Button
                  text={t('userProfile.actions.update')}
                  typography="md"
                  type="primary"
                  enabled={preferencesChanged}
                  onClick={this.updatePreferences}
                />
              </div>
            </div>
            {/* Billing */}
            <div className="profile-page-billing">
              <p className="text-style-h-4-medium color-fig-default">{t('userProfile.sections.billing')}</p>
              {((this.context.userAttributes.purchasePlatform &&
                this.context.userAttributes.purchasePlatform === 'web') ||
                this.context.userAttributes.accessLevel !== 3) && (
                <div className="profile-page-billing-row">
                  <div className="profile-page-billing-row-left">
                    <p className="text-style-label-medium color-fig-default">
                      {t('userProfile.descriptions.billingPrimary')}
                    </p>
                    <p className="text-style-label-normal color-fig-subtle">
                      {t('userProfile.descriptions.billingSecondary')}
                    </p>
                  </div>
                  <div className="profile-page-billing-row-right" style={{width: 144}}>
                    <Button
                      text={t('userProfile.actions.manageBilling')}
                      typography="md"
                      type="secondary"
                      enabled={true}
                      onClick={this.billingLinkClicked}
                    />
                  </div>
                </div>
              )}
              {this.context.userAttributes.accessLevel === 3 &&
                this.context.userAttributes.purchasePlatform &&
                this.context.userAttributes.purchasePlatform === 'ios' && (
                  <div className="profile-page-billing-row">
                    <div className="profile-page-billing-row-left">
                      <p className="text-style-label-medium color-fig-default">
                        {t('preferences.subscription.appleMessage')}
                      </p>
                    </div>
                    <div className="profile-page-billing-row-right" style={{width: 176}}>
                      <Button
                        text={t('preferences.subscription.manageTitle')}
                        typography="md"
                        type="secondary"
                        enabled={true}
                        onClick={this.mobileSubscriptionLinkClicked}
                      />
                    </div>
                  </div>
                )}
              {this.context.userAttributes.accessLevel === 3 &&
                this.context.userAttributes.purchasePlatform &&
                this.context.userAttributes.purchasePlatform === 'android' && (
                  <div className="profile-page-billing-row">
                    <div className="profile-page-billing-row-left">
                      <p className="text-style-label-medium color-fig-default">
                        {t('preferences.subscription.googlePlayMessage')}
                      </p>
                    </div>
                    <div className="profile-page-billing-row-right" style={{width: 176}}>
                      <Button
                        text={t('preferences.subscription.manageTitle')}
                        typography="md"
                        type="secondary"
                        enabled={true}
                        onClick={this.mobileSubscriptionLinkClicked}
                      />
                    </div>
                  </div>
                )}
            </div>

            {/* Delete account */}
            <div className="profile-page-delete-account">
              <p className="text-style-h-4-medium color-fig-default">{t('preferences.items.deleteAccount')}</p>
              <div className="profile-page-delete-account-row">
                <div className="profile-page-delete-account-row-left">
                  <p className="text-style-label-medium color-fig-default">
                    {t('userProfile.descriptions.deleteAccount')}
                  </p>
                  <p className="text-style-label-normal color-fig-subtle">
                    {t('userProfile.descriptions.deleteAccountSecondary')}
                  </p>
                </div>
                <div className="profile-page-delete-account-row-right">
                  <Dialog
                    open={this.state.deleteAccountDialogOpen}
                    onOpenChange={(open) =>
                      this.setState({
                        deleteAccountDialogOpen: open,
                        deleteAccount: {
                          acknowledgmentChecked:
                            this.state.deleteAccount.acknowledgmentChecked && open,
                          passwordFilled: this.state.deleteAccount.passwordFilled && open,
                          error: null
                        }
                      })
                    }
                    trigger={
                      <Button
                        text={t('userProfile.actions.deleteThisAccount')}
                        typography="md"
                        type="destructive"
                        enabled={true}
                        onClick={() => {
                          // The content here doesn't matter, looks like radix UI captures the event no matter what the content of the trigger is
                          // Just using the Button component for styling
                        }}
                      />
                    }
                    title={t('preferences.items.deleteAccount')}
                    content={
                      <div className="profile-page-delete-account-dialog-content">
                        {isPaidUser(this.context.userAttributes) && (
                          <p className="text-style-label-normal color-fig-subtle">
                            {t('preferences.deleteAccount.warningMessage')}
                          </p>
                        )}
                        {!isPaidUser(this.context.userAttributes) && (
                          <>
                            <div>
                              <p className="text-style-label-normal color-fig-subtle">
                                {t('userProfile.deleteAccount.confirmMessage')}
                              </p>
                              <p className="text-style-label-normal color-fig-subtle">
                                {t('userProfile.deleteAccount.permanentWarning')}
                              </p>
                            </div>
                            <div>
                              <p className="text-style-label-normal color-fig-subtle">
                                {t('userProfile.labels.enterYourPassword')}
                              </p>
                              <input
                                ref={this.deleteAccountPasswordRef}
                                type="password"
                                onInput={(e) =>
                                  this.setState({
                                    deleteAccount: {
                                      ...this.state.deleteAccount,
                                      passwordFilled: e.target.value && e.target.value.trim() !== ''
                                    }
                                  })
                                }
                              />
                              {this.state.deleteAccount.error && (
                                <p className="text-style-caption-normal color-fig-negative">
                                  {this.state.deleteAccount.error}
                                </p>
                              )}
                            </div>
                            <div>
                              <div className="profile-page-delete-account-dialog-content-checkbox-wrapper">
                                <Checkbox
                                  checked={this.state.deleteAccount.acknowledgmentChecked}
                                  onClick={() =>
                                    this.setState({
                                      deleteAccount: {
                                        ...this.state.deleteAccount,
                                        acknowledgmentChecked:
                                          !this.state.deleteAccount.acknowledgmentChecked
                                      }
                                    })
                                  }
                                />
                              </div>
                              <p className="text-style-label-normal color-fig-default">
                                {t('userProfile.deleteAccount.acknowledgment')}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    }
                    footer={
                      <div className="profile-page-delete-account-dialog-footer">
                        <div>
                          <Button
                            text={t('userProfile.actions.deleteThisAccount')}
                            typography="md"
                            type="destructive"
                            enabled={
                              this.state.deleteAccount.acknowledgmentChecked &&
                              this.state.deleteAccount.passwordFilled
                            }
                            onClick={this.deleteAccount}
                          />
                        </div>
                      </div>
                    }
                  />
                </div>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </>
    )
  }
}

export default withTranslation()(Profile)
