"""Unfold admin site that requires a one-time code from an authenticator app (django-otp TOTP)."""
from django import forms
from django_otp import devices_for_user
from django_otp.admin import OTPAdminAuthenticationForm
from unfold.sites import UnfoldAdminSite


class OTPLoginForm(OTPAdminAuthenticationForm):
    otp_token = forms.CharField(
        label='Код из приложения', required=True,
        widget=forms.TextInput(attrs={'autocomplete': 'one-time-code', 'inputmode': 'numeric', 'pattern': '[0-9]*', 'maxlength': 8}),
        help_text='6 цифр из Google Authenticator.')

    def _chosen_device(self, user):
        # django-otp requires an explicit device; each account has exactly one authenticator,
        # so use it rather than showing a device picker. With several devices nothing is guessed.
        device = super()._chosen_device(user)
        if device is None:
            devices = list(devices_for_user(user, confirmed=True, for_verify=True))
            device = devices[0] if len(devices) == 1 else None
        return device


class StanfordAdminSite(UnfoldAdminSite):
    site_header = 'Stanford'
    site_title = 'Stanford — админка'
    index_title = 'Содержимое сайта'
    site_url = None  # the admin has no site of its own; hides Unfold's «Return to site» link
    login_form = OTPLoginForm
    login_template = 'admin/stanford_login.html'

    def has_permission(self, request):
        # A password alone is not enough: the session must be verified by an OTP device.
        return super().has_permission(request) and request.user.is_verified()
