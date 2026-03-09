import { createApp } from 'vue'
import OrdersList from '../../views/OrdersList.vue'
import '../../styles.css'

const app = createApp(OrdersList)
app.mount('#orders-app')
document.body.style.opacity = "1";
