<!-- src/components/OrderCard.vue -->
<template>
  <div class="order-card">
    <div class="order-header">
      <span class="order-id">№ {{ order.id }}</span>
      <span class="order-status" :class="statusClass">{{ order.status }}</span>
    </div>
    <div class="order-info">
      <div><strong>Сумма:</strong> {{ order.amount }}</div>
      <div><strong>Дата:</strong> {{ order.date }}</div>
    </div>
    <div class="order-actions">
      <button type="button" @click="editOrder" class="btn edit">Изменить</button>
      <button type="button" @click="acceptOrder" class="btn accept">Принять</button>
      <button type="button" @click="rejectOrder" class="btn reject">Отклонить</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  order: {
    type: Object,
    required: true
  }
})

const statusClass = computed(() => {
  switch (props.order.status) {
    case 'Ожидает':
      return 'status-pending'
    case 'Принят':
      return 'status-accepted'
    case 'Отклонён':
      return 'status-rejected'
    default:
      return ''
  }
})

const editOrder = () => alert(`Редактировать заказ №${props.order.id}`)
const acceptOrder = () => alert(`Принят заказ №${props.order.id}`)
const rejectOrder = () => alert(`Отклонён заказ №${props.order.id}`)
</script>

<style scoped>
.order-card {
  width: 350px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 16px;
  margin-bottom: 16px;
  font-family: inherit;
}
.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
}
.order-id {
  font-size: 15px;
  color: var(--text, #0b0f0f);
}
.order-status {
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
}
.status-pending {
  background-color: #f0ad4e;
}
.status-accepted {
  background-color: #5cb85c;
}
.status-rejected {
  background-color: #d9534f;
}

.order-info div {
  margin-bottom: 6px;
  font-size: 14px;
  color: var(--text, #0b0f0f);
}
.order-info strong {
  color: var(--muted, #66707a);
  font-weight: 500;
  margin-right: 4px;
}
.order-actions {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-top: 12px;
}
.btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: opacity 0.2s;
}
.btn.edit {
  background-color: #5bc0de;
  color: #fff;
}
.btn.accept {
  background-color: #5cb85c;
  color: #fff;
}
.btn.reject {
  background-color: #d9534f;
  color: #fff;
}
.btn:hover {
  opacity: 0.9;
}
.btn:active {
  opacity: 0.85;
}
</style>
