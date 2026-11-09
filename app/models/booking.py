from sqlalchemy import Column 

from sqlalchemy import Integer 

from sqlalchemy import String 

from sqlalchemy import Date 

from sqlalchemy import Time 
 

from app.db.database import Base 
 

class Booking(Base): 

    __tablename__ = "bookings" 
    

    id = Column(Integer, primary_key=True, index=True) 


    client_name = Column(String, nullable=False) 


    phone = Column(String, nullable=False) 


    service = Column(String, nullable=False) 

    date = Column(Date, nullable=False) 
    

    start_time = Column(Time, nullable=False) 



    end_time = Column(Time, nullable=False) 

 
 