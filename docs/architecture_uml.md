# Bowling Ball Grid Generator - Architecture UML

This document captures the current high-level architecture and major component relationships.

```mermaid
classDiagram
    %% Frontend
    namespace Frontend {
        class App {
            +renderBagProvider()
            +renderLayout()
        }
        class Layout {
            +tabGrid
            +tabCatalog
            +tabSimulation
            +tabSim3d
            +tabAnalysis
            +tabDatabase
        }
        class ViewComponents {
            +arsenalPanel()
            +gridView()
            +recommendationsListCompact()
            +slotAssignmentPanel()
            +simulationView()
            +simulationView3d()
            +analysisView()
            +ballCatalog()
            +ballDatabaseView()
        }
        class BagContext {
            +bagState
            +savedArsenalId
            +arsenalBallIds
            +gameCounts
        }
        class FrontendApiClient {
            +get()
            +post()
            +patch()
            +del()
            +apiUrl()
        }
        class FrontendPhysics {
            +bowlingPhysics()
            +parametricPhysics()
            +physicsWorkers()
        }
    }

    %% Backend
    namespace Backend {
        class FastAPIApp {
            +healthRoute()
            +ballsRoutes()
            +arsenalsRoutes()
            +recommendationsRoutes()
            +gapsRoute()
            +slotsRoute()
            +degradationCompareRoute()
            +oilPatternsRoute()
            +adminRoutes()
        }
        class ServiceLayer {
            +listBalls()
            +getBall()
            +createArsenal()
            +getArsenal()
            +updateArsenal()
            +deleteArsenal()
            +getRecommendations()
            +getRecommendationsV2()
            +getGaps()
            +getSlotAssignments()
            +get_degradation_comparison()
            +listOilPatterns()
            +trainTwoTower()
        }
        class DbConnectionLayer {
            +psycopgConnection
            +getDb()
            +getConn()
        }
        class PostgreSQL {
            +balls
            +arsenals
            +arsenal_balls
            +arsenal_custom_balls
            +oil_patterns
        }
    }

    %% Domain engines
    namespace Engines {
        class RecommendationEngine {
            +recommend()
        }
        class GapEngine {
            +compute_gaps()
            +group_gaps_by_zone()
        }
        class DegradationEngine {
            +apply_degradation()
            +apply_degradation_v2()
            +compare_models()
        }
        class SlotAssignmentEngine {
            +assign_slots()
        }
        class TwoTowerModel {
            +train_model()
            +get_two_tower_recommendations()
        }
    }

    %% Relationships
    App --> BagContext : provides
    App --> Layout : renders
    Layout *-- ViewComponents : contains
    ViewComponents --> FrontendApiClient : calls
    ViewComponents --> FrontendPhysics : simulates

    FrontendApiClient --> FastAPIApp : httpApiProxy
    FastAPIApp --> ServiceLayer : delegates
    FastAPIApp --> DbConnectionLayer : usesGetDb
    ServiceLayer --> DbConnectionLayer : usesCursor
    DbConnectionLayer --> PostgreSQL : queries

    ServiceLayer --> RecommendationEngine : uses
    ServiceLayer --> GapEngine : uses
    ServiceLayer --> DegradationEngine : uses
    ServiceLayer --> SlotAssignmentEngine : uses
    ServiceLayer --> TwoTowerModel : optional v2 path
    RecommendationEngine --> TwoTowerModel : hybrid/v2 integration
```

### Component Breakdown
1. **Frontend (React + Vite)**  
   `App` wraps `Layout` with `BagProvider`. `Layout` hosts the primary tabs and renders feature views/panels.

2. **Frontend State and API Access**  
   `BagContext` is the shared arsenal state source of truth. API calls are centralized in `src/api/client.ts` and feature-specific API modules.

3. **Backend API (FastAPI)**  
   `app/main.py` defines route groups for health, balls, arsenals, recommendations (v1 and v2), gaps, slots, degradation comparison, oil patterns, and admin actions.

4. **Service and Engine Layer**  
   `app/services.py` contains business logic and composes domain engines (`recommendation_engine`, `gap_engine`, `degradation`, `slot_assignment`, and optional `two_tower`).

5. **Database Access (PostgreSQL + psycopg)**  
   `app/db.py` provides psycopg connections (`get_db`, `get_conn`). The service layer executes SQL directly against PostgreSQL tables.

6. **Simulation Path**  
   Physics simulation is primarily frontend-side (`src/physics/*`, workers) and is not a standard backend service dependency.
