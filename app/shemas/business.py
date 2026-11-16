from pydantic import BaseModel 

class BusinessCreate(BaseModel): 

 name: str 

 email: str 

 password: str 

 

 

class BusinessResponse(BaseModel): 

 id: int 

 name: str 

 email: str 

 slug: str 

 is_active: bool 


class Config: 

 from_attributes = True 