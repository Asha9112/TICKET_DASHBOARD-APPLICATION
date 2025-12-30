**Zoho Desk Ticket Dashboard**
📌 Project Overview
The Zoho Desk Ticket Dashboard is a production-ready full-stack web application that provides comprehensive agent performance analytics and ticket management capabilities. It integrates directly with the Zoho Desk REST API to deliver real-time insights into ticket volumes, agent productivity, resolution times, and departmental performance through interactive Chart.js visualizations.

This dashboard addresses real-world support team challenges including API rate limits, large dataset processing (10k+ records), and multi-dimensional performance analytics for IT support operations.

**Tech Stack**
- Frontend: React 18 + Vite + Chart.js + react-chartjs-2
- Backend: Node.js + Express.js
- API: Zoho Desk REST API
- Deployment: Windows Server + IIS
- Tools: Git/GitHub, Postman, React DevTools
  
✨ Key Features
6 Interactive Charts with real-time filtering

- Multi-Agent Selection (checkbox dropdown)

- Department-wise Analytics

- Yearly Trends (Created vs Resolved)

- Resolution Time Tracking

- Ticket Status Distribution

- CSAT & SLA Metrics

- API Pagination & Rate Limit Handling
  
**Project Structure**

frontend/
├── src/components/
│   ├── AgentPerformanceCharts.jsx  (Main dashboard)
│   ├── TicketDashboard.jsx
│   ├── AgentPerformanceTable.jsx
│   └── ArchivedTable.jsx
backend/
├── Application/
│   ├── agentPerformanceRoutes.js
│   └── zoho-desk-api.js
└── config/database.js

**Quick Setup prerequisites**
- Node.js 18+
- Zoho Desk API Credentials
- Git
- Installation

# Clone & Frontend
git clone [YOUR-REPO-URL]
cd frontend
npm install
npm run dev          # http://localhost:5173

# Backend (New Terminal)
cd backend
npm install
# Update .env with Zoho
npm start           # http://localhost:5000

**API Endpoints**
GET /api/agent-performance      → Agent metrics + CSAT/SLA
GET /api/tickets-yearly-summary → Yearly created vs resolved  
GET /api/zoho-departments      → Department list

**Screenshots**
<img width="1328" height="629" alt="image" src="https://github.com/user-attachments/assets/06969cf6-08bb-48d3-9d1c-b44548a8fb54" />

