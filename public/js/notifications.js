const Notifications = {
  async request() {
    if (!('Notification' in window)) return alert('Notifications not supported.');
    if (Notification.permission === 'default') await Notification.requestPermission();
  },

  send(title, body) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  },

  scheduleMealReminder() {
    this.request();
    const now = new Date();
    const target = new Date(now);
    target.setHours(12, 0, 0, 0);
    if (target < now) target.setDate(target.getDate() + 1);
    setTimeout(() => this.send('Apex Recomp', 'Time to log your lunch 🥗'), target - now);
  }
};
