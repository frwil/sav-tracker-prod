<?php 
namespace App\Repository;

use App\Entity\Flock;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class FlockRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Flock::class);
    }

    /**
     * Trouve la bande active pour un bâtiment donné.
     */
    public function findActiveFlockByBuilding($building): ?Flock
    {
        return $this->findOneBy([
            'building' => $building,
            'closed' => false
        ]);
    }
}