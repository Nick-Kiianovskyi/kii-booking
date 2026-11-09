from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session 

from app.db.database import SessionLocal, engine, Base 
from app.models.booking import Booking
from app.shemas.booking import BookingCreate

Base.metadata.create_all(bind=engine)

app = FastAPI(title="KII Booking") 

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/") 

def root(): 
     return {"message": "KII Booking API"} 
@app.get("/health")
def health():
    return {"status": "ok"}

 

@app.post("/bookings") 

def create_booking( 
  booking: BookingCreate, 

  db: Session = Depends(get_db) 

): 
 
  new_booking = Booking( 

 client_name=booking.client_name, 

 phone=booking.phone, 

 service=booking.service, 

 date=booking.date, 
 start_time=booking.start_time, 
 end_time=booking.end_time 

) 

 

  db.add(new_booking) 

  db.commit() 

  db.refresh(new_booking) 

 

  return { 

 "message": "Booking created", 

 "id": new_booking.id 

 } 