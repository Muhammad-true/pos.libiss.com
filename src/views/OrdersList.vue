<template>
  <div class="orders-list">
    <OrderCard
      v-for="order in orders"
      :key="order.id"
      :order="order"
    />
  </div>
</template>

<script setup>
import OrderCard from '../components/OrderCard.vue'

const orders = [
  {
    id: 'd85caa5c-9bdc-476c-8d75-ccc5babf88ce',
    status: 'Ожидает',
    amount: '800 TJS',
    date: '27.02.2026'
  },
  {
    id: 'a1234567-89ab-4cde-0123-456789abcdef',
    status: 'Принят',
    amount: '1200 TJS',
    date: '28.02.2026'
  }
]
</script>

<style scoped>
.orders-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
}
</style>
