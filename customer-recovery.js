import { CustomerAccessError, validGmail, passwordRequirements } from './customer-auth.js?v=sms-login-20261118';
const messages = {
  invalid_gmail: 'Enter the Gmail address registered to your LahuzGo account.',
  rate_limited: 'Too many requests. Please wait before requesting another code.',
  invalid_or_expired: 'This code or reset session is invalid or expired. Request a new code and try again.',
  weak_password: 'Choose a stronger password. Avoid common or exposed passwords.',
  same_password: 'Choose a password different from your current password.',
  reset_failed: 'The reset could not be confirmed. Request a new code before trying again.',
};
export class CustomerRecovery {
  constructor(client,{now=()=>Date.now()}={}) { this.client=client; this.now=now; this.clear(); }
  clear() { this.email='';this.challenge=null;this.resetToken=null;this.resendAt=0;this.expiresAt=0;this.sequence=(this.sequence||0)+1; }
  async call(body) {
    const result=await this.client.functions.invoke('customer-password-recovery',{body});
    let data=result.data;
    if(result.error){try{data=await result.error.context.json();}catch{data=null;}}
    if(result.error||!data?.ok)throw new CustomerAccessError(messages[data?.error]||'Could not complete password recovery. Check your connection and try again.',data?.error||'recovery_error');
    return data;
  }
  async start(value,{resend=false}={}) {
    const email=value.trim().toLowerCase();
    if(!validGmail(email))throw new CustomerAccessError(messages.invalid_gmail);
    if(resend&&this.now()<this.resendAt)throw new CustomerAccessError('Please wait before requesting another code.');
    const sequence=++this.sequence;this.resetToken=null;
    const data=await this.call({action:'start',email});
    if(sequence!==this.sequence)return false;
    if(!/^[a-f\d-]{36}$/i.test(data.challenge_id)||!/^[a-f\d]{64}$/.test(data.request_token))throw new CustomerAccessError('Could not start password recovery. Please try again.');
    this.email=email;this.challenge={id:data.challenge_id,requestToken:data.request_token};
    this.resendAt=this.now()+60_000;this.expiresAt=this.now()+600_000;return true;
  }
  async verify(code) {
    if(!this.challenge||this.now()>=this.expiresAt||!/^\d{6}$/.test(code))throw new CustomerAccessError(messages.invalid_or_expired);
    const sequence=this.sequence;
    const data=await this.call({action:'verify',challenge_id:this.challenge.id,request_token:this.challenge.requestToken,code});
    if(sequence!==this.sequence)return false;
    if(!/^[a-f\d]{64}$/.test(data.reset_token))throw new CustomerAccessError(messages.invalid_or_expired);
    this.resetToken=data.reset_token;this.challenge.requestToken=null;this.expiresAt=this.now()+300_000;return true;
  }
  async finish(password,confirmation) {
    if(!this.challenge||!this.resetToken||this.now()>=this.expiresAt)throw new CustomerAccessError(messages.invalid_or_expired);
    if(password.length>256||!Object.values(passwordRequirements(password)).every(Boolean))throw new CustomerAccessError('Use 8 or more characters, uppercase and lowercase letters, a number and a special character.');
    if(password!==confirmation)throw new CustomerAccessError('Your passwords do not match.');
    const sequence=this.sequence;
    await this.call({action:'finish',challenge_id:this.challenge.id,reset_token:this.resetToken,password});
    if(sequence!==this.sequence)return false;
    this.clear();return true;
  }
}
