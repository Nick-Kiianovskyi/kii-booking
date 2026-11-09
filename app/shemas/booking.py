from datetime import date, time 

 

from pydantic import BaseModel 


class BookingCreate(BaseModel): 

    client_name: str 

    phone: str 

    service: str 

    date: date 

    start_time: time 

    end_time: time 

class BookingResponse(BaseModel): 

 id: int 
 client_name: str 
 phone: str 
 service: str 
 date: date 
 start_time: time 
 end_time: time 


class Config: 

 from_attributes = True 